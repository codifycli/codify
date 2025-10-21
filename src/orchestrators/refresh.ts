import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { ctx, ProcessName, SubProcessName } from '../events/context.js';
import { FileModificationCalculator } from '../generators/file-modification-calculator.js';
import { ModificationType } from '../generators/index.js';
import { FileUpdater } from '../generators/writer.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { groupBy, sleep } from '../utils/index.js';
import { wildCardMatch } from '../utils/wild-card-match.js';

export type RefreshResult = { result: ResourceConfig[], errors: string[] }

export interface RefreshArgs {
  typeIds?: string[];
  path: string;
  secureMode?: boolean;
  verbosityLevel?: number;
}

export class RefreshOrchestrator {
  static async run(
    args: RefreshArgs,
    reporter: Reporter
  ) {
    const typeIds = args.typeIds?.filter(Boolean)
    ctx.processStarted(ProcessName.REFRESH)

    const initializationResult = await PluginInitOrchestrator.run(
      { ...args, allowEmptyProject: true },
      reporter,
    );
    const { project } = initializationResult;

    // if ((!typeIds || typeIds.length === 0) && project.isEmpty()) {
    //   throw new Error('At least one resource [type] must be specified. Ex: "codify refresh homebrew". Or the import command must be run in a directory with a valid codify file')
    // }

    const { pluginManager } = initializationResult;
    await pluginManager.validate(project);
    const importResult = await RefreshOrchestrator.import(
      pluginManager,
      project.resourceConfigs.filter((r) => !typeIds || typeIds.includes(r.type))
    );

    ctx.processFinished(ProcessName.REFRESH);

    reporter.displayImportResult(importResult, false);

    const resourceInfoList = await pluginManager.getMultipleResourceInfo(
      project.resourceConfigs.map((r) => r.type),
    );

    await RefreshOrchestrator.updateExistingFiles(
      reporter,
      project,
      importResult,
      resourceInfoList,
      project.codifyFiles[0],
      pluginManager,
    );
  }

  static async import(
    pluginManager: PluginManager,
    resources: ResourceConfig[],
  ): Promise<RefreshResult> {
    const importedConfigs: ResourceConfig[] = [];
    const errors: string[] = [];

    ctx.subprocessStarted(SubProcessName.IMPORT_RESOURCE);

    await Promise.all(resources.map(async (resource) => {

      try {
        const response = await pluginManager.importResource(resource.toJson());

        if (response.result !== null && response.result.length > 0) {
          importedConfigs.push(...response
            ?.result
            ?.map((r) =>
              // Keep the name on the resource if possible, this makes it easier to identify where the import came from
              ResourceConfig.fromJson({ ...r, core: { ...r.core, name: resource.name } })
            ) ?? []
          );
        } else {
          errors.push(`Unable to import resource '${resource.type}', resource not found`);
        }
      } catch (error: any) {
        errors.push(error.message ?? error);
      }

    }))

    ctx.subprocessFinished(SubProcessName.IMPORT_RESOURCE);

    return {
      result: importedConfigs,
      errors,
    }
  }

  private static matchTypeIds(typeIds: string[], validTypeIds: string[]): string[] {
    const result: string[] = [];
    const unsupportedTypeIds: string[] = [];

    for (const typeId of typeIds) {
      if (!typeId.includes('*') && !typeId.includes('?')) {
        const matched = validTypeIds.includes(typeId);
        if (!matched) {
          unsupportedTypeIds.push(typeId);
          continue;
        }

        result.push(typeId)
        continue;
      }

      const matched = validTypeIds.filter((valid) => wildCardMatch(valid, typeId))
      if (matched.length === 0) {
        unsupportedTypeIds.push(typeId);
        continue;
      }

      result.push(...matched);
    }

    if (unsupportedTypeIds.length > 0) {
      throw new Error(`The following resources cannot be imported. No plugins found that support the following types:
${JSON.stringify(unsupportedTypeIds)}`);
    }

    return result;
  }

  private static async validate(typeIds: string[], project: Project, pluginManager: PluginManager, dependencyMap: DependencyMap): Promise<void> {
    project.validateTypeIds(dependencyMap);

    const unsupportedTypeIds = typeIds.filter((type) => !dependencyMap.has(type));
    if (unsupportedTypeIds.length > 0) {
      throw new Error(`The following resources cannot be imported. No plugins found that support the following types:
${JSON.stringify(unsupportedTypeIds)}`);
    }
  }

  private static async updateExistingFiles(
    reporter: Reporter,
    existingProject: Project,
    importResult: RefreshResult,
    resourceInfoList: ResourceInfo[],
    preferredFile: string, // File to write any new resources (unknown file path)
    pluginManager: PluginManager,
  ): Promise<void> {
    const groupedResults = groupBy(importResult.result, (r) =>
      existingProject.findSpecific(r.type, r.name)?.sourceMapKey?.split('#')?.[0] ?? 'unknown'
    )

    // New resources exists (they don't belong to any existing files)
    if (groupedResults.unknown) {
      groupedResults[preferredFile] = [
        ...(groupedResults.unknown ?? []),
        ...(groupedResults[preferredFile] ?? []),
      ]
      delete groupedResults.unknown;
    }

    const diffs = await Promise.all(Object.entries(groupedResults).map(async ([filePath, imported]) => {
      const existing = await CodifyParser.parse(filePath!);
      RefreshOrchestrator.attachResourceInfo(imported, resourceInfoList);
      RefreshOrchestrator.attachResourceInfo(existing.resourceConfigs, resourceInfoList);

      const modificationCalculator = new FileModificationCalculator(existing);
      const modification = await modificationCalculator.calculate(
        imported.map((resource) => ({
          modification: ModificationType.INSERT_OR_UPDATE,
          resource
        })),
        // Handle matching here since we need the plugin to determine if two configs represent the same underlying resource
        async (resource, array) => {
          const match = await pluginManager.match(resource, array.filter((r) => r.type === resource.type));
          return array.findIndex((i) => i.isDeepEqual(match));
        }
      );

      return { file: filePath!, modification };
    }));

    // No changes to be made
    if (diffs.every((d) => d.modification.diff === '')) {
      reporter.displayMessage('\nNo changes are needed! Exiting...')

      // Wait for the message to display before we exit
      await sleep(100);
      return;
    }

    reporter.displayFileModifications(diffs);
    const shouldSave = await reporter.promptConfirmation('Save the changes?');
    if (!shouldSave) {
      reporter.displayMessage('\nSkipping save! Exiting...');

      // Wait for the message to display before we exit
      await sleep(100);
      return;
    }

    for (const diff of diffs) {
      await FileUpdater.write(diff.file, diff.modification.newFile);
    }

    reporter.displayMessage('\n🎉 Imported completed and saved to file 🎉');

    // Wait for the message to display before we exit
    await sleep(100);
  }

  // We have to attach additional info to the imported configs to make saving easier
  private static attachResourceInfo(resources: ResourceConfig[], resourceInfoList: ResourceInfo[]): void {
    resources.forEach((resource) => {
      const matchedInfo = resourceInfoList.find((info) => info.type === resource.type)!;
      if (!matchedInfo) {
        throw new Error(`Could not find type ${resource.type} in the resource info`);
      }

      resource.attachResourceInfo(matchedInfo);
    })
  }
}


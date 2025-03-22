import path from 'node:path';

import { InitializationResult, PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { prettyFormatFileDiff } from '../ui/file-diff-pretty-printer.js';
import { PromptType, Reporter } from '../ui/reporters/reporter.js';
import { FileUtils } from '../utils/file.js';
import { FileModificationCalculator, ModificationType } from '../utils/file-modification-calculator.js';
import { groupBy, sleep } from '../utils/index.js';
import { wildCardMatch } from '../utils/wild-card-match.js';

export type ImportResult = { result: ResourceConfig[], errors: string[] }

export interface ImportArgs {
  typeIds?: string[];
  path: string;
  secureMode?: boolean;
  verbosityLevel?: number;
}

export class ImportOrchestrator {
  static async run(
    args: ImportArgs,
    reporter: Reporter
  ) {
    const typeIds = args.typeIds?.filter(Boolean)
    ctx.processStarted(ProcessName.IMPORT)

    const initializationResult = await PluginInitOrchestrator.run(
      { ...args, allowEmptyProject: true },
      reporter
    );
    const { project } = initializationResult;

    if ((!typeIds || typeIds.length === 0) && project.isEmpty()) {
      throw new Error('At least one resource [type] must be specified. Ex: "codify import homebrew". Or the import command must be run in a directory with a valid codify file')
    }

    await (!typeIds || typeIds.length === 0
      ? ImportOrchestrator.runExistingProject(reporter, initializationResult)
      : ImportOrchestrator.runNewImport(typeIds, reporter, initializationResult));
  }

  /** Import new resources. Type ids supplied. This will ask for any required parameters */
  static async runNewImport(typeIds: string[], reporter: Reporter, initializeResult: InitializationResult): Promise<void> {
    const { project, pluginManager, typeIdsToDependenciesMap } = initializeResult;

    const matchedTypes = this.matchTypeIds(typeIds, [...typeIdsToDependenciesMap.keys()])
    await ImportOrchestrator.validate(matchedTypes, project, pluginManager, typeIdsToDependenciesMap);

    const resourceInfoList = (await pluginManager.getMultipleResourceInfo(matchedTypes))
      .filter((info) => info.canImport)

    const resourcesToImport = await ImportOrchestrator.getImportParameters(reporter, project, resourceInfoList);
    const importResult = await ImportOrchestrator.import(pluginManager, resourcesToImport);

    ctx.processFinished(ProcessName.IMPORT)

    reporter.displayImportResult(importResult, false);

    resourceInfoList.push(...(await pluginManager.getMultipleResourceInfo(
      project.resourceConfigs.map((r) => r.type)
    )));
    await ImportOrchestrator.saveResults(reporter, importResult, project, resourceInfoList, pluginManager)
  }

  /** Update an existing project. This will use the existing resources as the parameters (no user input required). */
  static async runExistingProject(reporter: Reporter, initializeResult: InitializationResult): Promise<void> {
    const { pluginManager, project } = initializeResult;

    await pluginManager.validate(project);
    const importResult = await ImportOrchestrator.import(pluginManager, project.resourceConfigs);

    ctx.processFinished(ProcessName.IMPORT);

    reporter.displayImportResult(importResult, false);

    const resourceInfoList = await pluginManager.getMultipleResourceInfo(
      project.resourceConfigs.map((r) => r.type),
    );

    await ImportOrchestrator.updateExistingFiles(
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
  ): Promise<ImportResult> {
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

  private static async getImportParameters(reporter: Reporter, project: Project, resourceInfoList: ResourceInfo[]): Promise<Array<ResourceConfig>> {
    // Figure out which resources we need to prompt the user for additional info (based on the resource info)
    const [noPrompt, askPrompt] = resourceInfoList.reduce((result, info) => {
      info.getRequiredParameters().length === 0 ? result[0].push(info) : result[1].push(info);
      return result;
    }, [<ResourceInfo[]>[], <ResourceInfo[]>[]])

    askPrompt.forEach((info) => {
      const matchedResources = project.findAll(info.type);
      if (matchedResources.length > 0) {
        info.attachDefaultValues(matchedResources[0]);
      }
    })

    if (askPrompt.length > 0) {
      await reporter.displayImportWarning(askPrompt.map((r) => r.type), noPrompt.map((r) => r.type));
    }

    const userSupplied = await reporter.promptUserForValues(askPrompt, PromptType.IMPORT);

    return [
      ...noPrompt.map((info) => new ResourceConfig({ type: info.type })),
      ...userSupplied
    ]
  }

  private static async saveResults(
    reporter: Reporter,
    importResult: ImportResult,
    project: Project,
    resourceInfoList: ResourceInfo[],
    pluginManager: PluginManager,
  ): Promise<void> {
    const projectExists = !project.isEmpty();
    const multipleCodifyFiles = project.codifyFiles.length > 1;

    const promptResult = await reporter.promptOptions(
      '\nDo you want to save the results?',
      [
        projectExists ?
          multipleCodifyFiles ? 'Update existing files' : `Update existing file (${project.codifyFiles})`
          : undefined,
        'In a new file',
        'No'
      ].filter(Boolean) as string[]
    )

    // Update an existing file
    if (projectExists && promptResult === 0) {
      const file = multipleCodifyFiles
        ? project.codifyFiles[await reporter.promptOptions('\nIf new resources are added, where to write them?', project.codifyFiles)]
        : project.codifyFiles[0];
      await ImportOrchestrator.updateExistingFiles(reporter, project, importResult, resourceInfoList, file, pluginManager);
      return;
    }

    // Write to a new file
    if ((!projectExists && promptResult === 0) || (projectExists && promptResult === 1)) {
      const newFileName = await ImportOrchestrator.generateNewImportFileName();
      await ImportOrchestrator.saveNewFile(reporter, newFileName, importResult);
      return;
    }

    // No writes
    reporter.displayImportResult(importResult, true);
    reporter.displayMessage('\n🎉 Imported completed 🎉')

    await sleep(100);
  }

  private static async updateExistingFiles(
    reporter: Reporter,
    existingProject: Project,
    importResult: ImportResult,
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
      ImportOrchestrator.attachResourceInfo(imported, resourceInfoList);
      ImportOrchestrator.attachResourceInfo(existing.resourceConfigs, resourceInfoList);

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
      await FileUtils.writeFile(diff.file, diff.modification.newFile);
    }

    reporter.displayMessage('\n🎉 Imported completed and saved to file 🎉');

    // Wait for the message to display before we exit
    await sleep(100);
  }

  private static async saveNewFile(reporter: Reporter, filePath: string, importResult: ImportResult): Promise<void> {
    const newFile = JSON.stringify(importResult.result.map((r) => r.raw), null, 2);
    const diff = prettyFormatFileDiff('', newFile);

    reporter.displayFileModifications([{ file: filePath, modification: { newFile, diff } }]);

    const shouldSave = await reporter.promptConfirmation(`Save the changes? (${filePath})`);
    if (!shouldSave) {
      reporter.displayMessage('\nSkipping save! Exiting...');

      // Wait for the message to display before we exit
      await sleep(100);
      return;
    }

    await FileUtils.writeFile(filePath, newFile);

    reporter.displayMessage('\n🎉 Imported completed and saved to file 🎉');

    // Wait for the message to display before we exit
    await sleep(100);
  }

  private static async generateNewImportFileName(): Promise<string> {
    const cwd = process.cwd();

    // Save codify to a new folder so it doesn't interfere with the current project
    const folderPath = path.join(cwd, 'codify-imports')
    await FileUtils.createFolder(folderPath)

    let fileName = path.join(folderPath, 'import.codify.json')
    let counter = 1;

    while(true) {
      if (!(await FileUtils.fileExists(fileName))) {
        return fileName;
      }

      fileName = path.join(folderPath, `import-${counter}.codify.json`);
      counter++;
    }
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


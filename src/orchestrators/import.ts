import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ApiClient } from '../api/backend/index.js';
import { InitializationResult, PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { LoginHelper } from '../connect/login-helper.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { FileModificationCalculator } from '../generators/file-modification-calculator.js';
import { ModificationType } from '../generators/index.js';
import { FileUpdater } from '../generators/writer.js';
import { CodifyParser } from '../parser/index.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { prettyFormatFileDiff } from '../ui/file-diff-pretty-printer.js';
import { PromptType, Reporter } from '../ui/reporters/reporter.js';
import { FileUtils } from '../utils/file.js';
import { groupBy, sleep } from '../utils/index.js';
import { wildCardMatch } from '../utils/wild-card-match.js';
import { LoginOrchestrator } from './login.js';

export type ImportResult = { result: ResourceConfig[], errors: string[] }

export interface ImportArgs {
  typeIds?: string[];
  path: string;
  updateExisting?: boolean;
  includeSensitive?: boolean;
  verbosityLevel?: number;
}

enum SaveType {
  EXISTING,
  NEW,
  NONE
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

    await (!typeIds || typeIds.length === 0
      ? ImportOrchestrator.autoImportAll(reporter, initializationResult, args)
      : ImportOrchestrator.runNewImport(typeIds, reporter, initializationResult, args));
  }

  static async autoImportAll(reporter: Reporter, initializeResult: InitializationResult, args: ImportArgs) {
    const { project, pluginManager, resourceDefinitions } = initializeResult;

    ctx.subprocessStarted(SubProcessName.IMPORT_RESOURCE)

    // Omit sensitive resources if not included
    const typeIdsToImport = [...resourceDefinitions.keys()]
      .filter((typeId) => args.includeSensitive || (!args.includeSensitive && (resourceDefinitions.get(typeId)?.sensitiveParameters ?? []).length === 0))

    const importResults = await Promise.all(typeIdsToImport.map(async (typeId) => {
      try {
        return await pluginManager.importResource({
          core: { type: typeId },
          parameters: {}
        }, true);
      } catch {
        return null;
      }
    }))

    ctx.subprocessFinished(SubProcessName.IMPORT_RESOURCE);

    const flattenedResults = importResults.filter(Boolean).flatMap(p => p?.result).filter(Boolean)

    const userSelectedTypes = await reporter.promptInitResultSelection([...new Set(flattenedResults.map((r) => r!.core.type))])
    ctx.log('Resource types were chosen to be imported.')

    ctx.processFinished(ProcessName.IMPORT);

    const importedResources = flattenedResults.filter((r) => r && userSelectedTypes.includes(r.core.type))
      .map((r) => ResourceConfig.fromJson(r!));

    const resourceInfoList = await pluginManager.getMultipleResourceInfo(
      [...project.resourceConfigs, ...importedResources].map((r) => r.type),
    );

    await ImportOrchestrator.saveResults(
      reporter,
      { result: importedResources, errors: [] },
      project,
      resourceInfoList,
      pluginManager,
      args
    )
  }

  /** Import new resources. Type ids supplied. This will ask for any required parameters */
  static async runNewImport(typeIds: string[], reporter: Reporter, initializeResult: InitializationResult, args: ImportArgs): Promise<void> {
    const { project, pluginManager, resourceDefinitions } = initializeResult;

    const matchedTypes = this.matchTypeIds(typeIds, [...resourceDefinitions.keys()])
    await ImportOrchestrator.validate(matchedTypes, project, pluginManager, resourceDefinitions);

    const resourceInfoList = (await pluginManager.getMultipleResourceInfo(matchedTypes))
      .filter((info) => info.canImport)

    const resourcesToImport = await ImportOrchestrator.getImportParameters(reporter, project, resourceInfoList);
    const importResult = await ImportOrchestrator.import(pluginManager, resourcesToImport);

    ctx.processFinished(ProcessName.IMPORT)

    reporter.displayImportResult(importResult, false);

    resourceInfoList.push(...(await pluginManager.getMultipleResourceInfo(
      project.resourceConfigs.map((r) => r.type)
    )));
    await ImportOrchestrator.saveResults(reporter, importResult, project, resourceInfoList, pluginManager, args)
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

  static async saveResults(
    reporter: Reporter,
    importResult: ImportResult,
    project: Project,
    resourceInfoList: ResourceInfo[],
    pluginManager: PluginManager,
    args: ImportArgs,
  ): Promise<void> {
    // Special handling for remote-file resources. Offer to save them remotely if any changes are detected on import.
    await ImportOrchestrator.handleCodifyRemoteFiles(reporter, importResult);

    const multipleCodifyFiles = project.path.length > 1;
    const saveType = await ImportOrchestrator.getSaveType(reporter, project, args);

    // Update an existing file
    if (saveType === SaveType.EXISTING) {
      const file = multipleCodifyFiles
        ? project.path[await reporter.promptOptions('\nIf new resources are added, where to write them?', project.path)]
        : project.path;
      await ImportOrchestrator.updateExistingFiles(reporter, project, importResult, resourceInfoList, file, pluginManager);
      return;
    }

    // Write to a new file
    if (saveType === SaveType.NEW) {
      const newFileName = await ImportOrchestrator.generateNewImportFileName();
      await ImportOrchestrator.saveNewFile(reporter, newFileName, importResult);
      return;
    }

    // No writes
    reporter.displayImportResult(importResult, true);
    reporter.displayMessage('\n🎉 Imported completed 🎉')

    await sleep(100);
  }

  static async updateExistingFiles(
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
      await FileUpdater.write(diff.file, diff.modification.newFile);
    }

    reporter.displayMessage('\n🎉 Imported completed and saved to file 🎉');

    // Wait for the message to display before we exit
    await sleep(100);
  }

  // Special handling for codify remote files. Import and refresh can automatically save file updates.
  static async handleCodifyRemoteFiles(reporter: Reporter, importResult: ImportResult) {
    try {
      if (!importResult.result.some((r) => r.type === 'remote-file')) {
        return;
      }

      if (!LoginHelper.get()?.isLoggedIn) {
        await LoginOrchestrator.run();
      }

      const credentials = LoginHelper.get()!.credentials!.accessToken;

      const filesToUpdate = [];
      const remoteFiles = importResult.result.filter((r) => r.type === 'remote-file');
      for (const file of remoteFiles) {
        if (!file.parameters.remote || !file.parameters.hash) {
          continue;
        }

        let hash: string
        try {
          hash = await ApiClient.getRemoteFileHash(file.parameters.remote as string, credentials);
        } catch {
          hash = '';
        }

        if (hash && hash !== '' && file.parameters.onlyCreate) {
          continue;
        }

        if (hash !== file.parameters.hash) {
          filesToUpdate.push(file);
        }
      }

      if (filesToUpdate.length === 0) {
        return;
      }

      const fileNames = filesToUpdate.map((f, idx) => `${idx + 1}. ${f.parameters.path} -> ${f.parameters.remote}`).join(',\n');
      const shouldUpdate = await reporter.promptConfirmation(
        `The following files have been updated:\n${fileNames}\n\nDo you want to upload the changes to Codify cloud? ${chalk.bold('(Warning this will override any existing data!)')}`,
      );

      if (!shouldUpdate) {
        return;
      }

      for (const file of filesToUpdate) {
        if (!file.parameters.path) {
          console.warn(`Unable to find file path for file ${file.parameters.remote}`)
          continue;
        }

        const content = await fs.readFile(file.parameters.path as string);
        await ApiClient.updateRemoteFile(file.parameters.remote as string, new Blob([content]), credentials);
      }

      ctx.log('Successfully uploaded changes to Codify remote');
    } catch {
      console.warn('Unable to process remote-files');
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

  private static async validate(typeIds: string[], project: Project, pluginManager: PluginManager, resourceDefinitions: ResourceDefinitionMap): Promise<void> {
    project.validateTypeIds(resourceDefinitions);

    const unsupportedTypeIds = typeIds.filter((type) => !resourceDefinitions.has(type));
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
  
  private static async getSaveType(
    reporter: Reporter,
    project: Project,
    args: ImportArgs,
  ): Promise<SaveType> {
    const projectExists = project.exists();
    const multipleCodifyFiles = project.path.length > 1;
    
    if (args.updateExisting && projectExists) {
      return SaveType.EXISTING;
    }

    const promptResult = await reporter.promptOptions(
        '\nDo you want to save the results?',
        [
          projectExists ?
            multipleCodifyFiles ? 'Update existing files' : `Update existing file (${project.path})`
            : undefined,
          'In a new file',
          'No'
        ].filter(Boolean) as string[]
      );
    
    if (projectExists) {
      switch (promptResult) {
        case 0: { return SaveType.EXISTING; }
        case 1: { return SaveType.NEW; }
        case 2: { return SaveType.NONE; }
      }
    } else {
      switch (promptResult) {
        case 0: { return SaveType.NEW; }
        case 1: { return SaveType.NONE; }
      }
    }

    throw new Error('Unexpected response from prompt');
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

    await FileUpdater.write(filePath, newFile);

    reporter.displayMessage('\n🎉 Imported completed and saved to file 🎉');

    // Wait for the message to display before we exit
    await sleep(100);
  }

  private static async generateNewImportFileName(): Promise<string> {
    const cwd = process.cwd();

    let fileName = path.join(cwd, 'import.codify.jsonc')
    let counter = 1;

    while (true) {
      if (!(await FileUtils.fileExists(fileName))) {
        return fileName;
      }

      fileName = path.join(cwd, `import-${counter}.codify.jsonc`);
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


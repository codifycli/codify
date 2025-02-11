import path from 'node:path';

import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { PromptType, Reporter } from '../ui/reporters/reporter.js';
import { FileUtils } from '../utils/file.js';
import { FileModificationCalculator, ModificationType } from '../utils/file-modification-calculator.js';
import { sleep } from '../utils/index.js';
import { wildCardMatch } from '../utils/wild-card-match.js';
import { InitializeOrchestrator } from './initialize.js';

export type RequiredParameters = Map<string, RequiredParameter[]>;
export type UserSuppliedParameters = Map<string, Record<string, unknown>>;
export type ImportResult = { result: ResourceConfig[], errors: string[] }

export interface ImportArgs {
  typeIds: string[];
  path: string;
  secureMode?: boolean;
}

export interface RequiredParameter {
  /**
   * The name of the parameter.
   */
  name: string;

  /**
   * The type (string, number, boolean) of the parameter. Un-related to type ids
   */
  type: string;

  /**
   * Description for a field
   */
  description?: string;
}

export class ImportOrchestrator {
  static async run(
    args: ImportArgs,
    reporter: Reporter
  ) {
    const { typeIds } = args
    if (typeIds.length === 0) {
      throw new Error('At least one resource <type> must be specified. Ex: "codify import homebrew"')
    }

    ctx.processStarted(ProcessName.IMPORT)

    const { typeIdsToDependenciesMap, pluginManager, project } = await InitializeOrchestrator.run(
      { ...args, allowEmptyProject: true },
      reporter
    );
    
    const matchedTypes = this.matchTypeIds(typeIds, [...typeIdsToDependenciesMap.keys()])
    await ImportOrchestrator.validate(matchedTypes, project, pluginManager, typeIdsToDependenciesMap);

    const resourceInfoList = await pluginManager.getMultipleResourceInfo(matchedTypes);

    const importParameters = await ImportOrchestrator.getImportParameters(reporter, project, resourceInfoList);
    const importResult = await ImportOrchestrator.import(pluginManager, importParameters);

    ctx.processFinished(ProcessName.IMPORT)
    reporter.displayImportResult(importResult, false);

    const additionalResourceInfo = await pluginManager.getMultipleResourceInfo(project.resourceConfigs.map((r) => r.type));
    resourceInfoList.push(...additionalResourceInfo);

    await ImportOrchestrator.saveResults(reporter, importResult, project, resourceInfoList)
  }

  static async import(
    pluginManager: PluginManager,
    resources: ResourceConfig[],
  ): Promise<ImportResult> {
    const importedConfigs: ResourceConfig[] = [];
    const errors: string[] = [];

    await Promise.all(resources.map(async (resource) => {
      ctx.subprocessStarted(SubProcessName.IMPORT_RESOURCE, resource.type);

      try {
        const response = await pluginManager.importResource(resource.toJson());

        if (response.result !== null && response.result.length > 0) {
          importedConfigs.push(...response
            ?.result
            ?.map((r) => ResourceConfig.fromJson(r)) ?? []
          );
        } else {
          errors.push(`Unable to import resource '${resource.type}', resource not found`);
        }
      } catch (error: any) {
        errors.push(error.message ?? error);
      }

      ctx.subprocessFinished(SubProcessName.IMPORT_RESOURCE, resource.type);
    }))

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
    ctx.subprocessStarted(SubProcessName.VALIDATE)

    project.validateTypeIds(dependencyMap);

    const unsupportedTypeIds = typeIds.filter((type) => !dependencyMap.has(type));
    if (unsupportedTypeIds.length > 0) {
      throw new Error(`The following resources cannot be imported. No plugins found that support the following types:
${JSON.stringify(unsupportedTypeIds)}`);
    }

    ctx.subprocessFinished(SubProcessName.VALIDATE)
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

    const userSupplied = await reporter.promptUserForValues(askPrompt, PromptType.IMPORT);

    return [
      ...noPrompt.map((info) => new ResourceConfig({ type: info.type })),
      ...userSupplied
    ]
  }

  private static async saveResults(reporter: Reporter, importResult: ImportResult, project: Project, resourceInfoList: ResourceInfo[]): Promise<void> {
    const projectExists = !project.isEmpty();
    const multipleCodifyFiles = project.codifyFiles.length > 1;

    const promptResult = await reporter.promptOptions(
      '\nDo you want to save the results?',
      [projectExists ? multipleCodifyFiles ? 'Update existing file (multiple found)' : `Update existing file (${project.codifyFiles})` : undefined, 'In a new file', 'No'].filter(Boolean) as string[]
    )

    if (promptResult === 'Update existing file (multiple found)') {
      const file = await reporter.promptOptions(
        '\nWhich file would you like to update?',
        project.codifyFiles,
      )
      await ImportOrchestrator.updateExistingFile(reporter, file, importResult, resourceInfoList);

    } else if (promptResult.startsWith('Update existing file')) {
      await ImportOrchestrator.updateExistingFile(reporter, project.codifyFiles[0], importResult, resourceInfoList);

    } else if (promptResult === 'In a new file') {
      const newFileName = await ImportOrchestrator.generateNewImportFileName();
      await ImportOrchestrator.saveNewFile(newFileName, importResult);

    } else if (promptResult === 'No') {
      reporter.displayImportResult(importResult, true);
      reporter.displayMessage('\n🎉 Imported completed 🎉')

      await sleep(100);
      process.exit(0);
    }
  }

  private static async updateExistingFile(
    reporter: Reporter,
    filePath: string,
    importResult: ImportResult,
    resourceInfoList: ResourceInfo[]
  ): Promise<void> {
    const existing = await CodifyParser.parse(filePath);
    ImportOrchestrator.attachResourceInfo(importResult.result, resourceInfoList);
    ImportOrchestrator.attachResourceInfo(existing.resourceConfigs, resourceInfoList);

    const modificationCalculator = new FileModificationCalculator(existing);
    const result = modificationCalculator.calculate(importResult.result.map((resource) => ({
      modification: ModificationType.INSERT_OR_UPDATE,
      resource
    })));

    // No changes to be made
    if (result.diff === '') {
      reporter.displayMessage('\nNo changes are needed! Exiting...')

      // Wait for the message to display before we exit
      await sleep(100);
      process.exit(0);
    }

    reporter.displayFileModification(result.diff);
    const shouldSave = await reporter.promptConfirmation(`Save to file (${filePath})?`);
    if (!shouldSave) {
      reporter.displayMessage('\nSkipping save! Exiting...');

      // Wait for the message to display before we exit
      await sleep(100);
      process.exit(0);
    }

    await FileUtils.writeFile(filePath, result.newFile);

    reporter.displayMessage('\n🎉 Imported completed and saved to file 🎉');

    // Wait for the message to display before we exit
    await sleep(100);
  }

  private static async saveNewFile(filePath: string, importResult: ImportResult): Promise<void> {
    const newFile = JSON.stringify(importResult, null, 2);
    await FileUtils.writeFile(filePath, newFile);
  }

  private static async generateNewImportFileName(): Promise<string> {
    const cwd = process.cwd();

    let fileName = path.join(cwd, 'import.codify.json')
    let counter = 1;

    while(true) {
      if (!(await FileUtils.fileExists(fileName))) {
        return fileName;
      }

      fileName = path.join(cwd, `import-${counter}.codify.json`);
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


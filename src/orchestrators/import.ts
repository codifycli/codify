import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { PromptType, Reporter } from '../ui/reporters/reporter.js';
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

    const { dependencyMap, pluginManager, project } = await InitializeOrchestrator.run(
      { ...args, allowEmptyProject: true },
      reporter
    );
    await ImportOrchestrator.validate(typeIds, project, pluginManager, dependencyMap)
    const resourceInfoList = await pluginManager.getMultipleResourceInfo(typeIds);
    
    const [noPrompt, askPrompt] = resourceInfoList.reduce((result, info) => {
      info.getRequiredParameters().length === 0 ? result[0].push(info) : result[1].push(info);
      
      return result;
    }, [<ResourceInfo[]>[], <ResourceInfo[]>[]])

    const userSupplied = await reporter.promptUserForValues(askPrompt, PromptType.IMPORT);
    
    const valuesToImport = [
      ...noPrompt.map((info) => new ResourceConfig({ type: info.type })),
      ...userSupplied
    ]
    const importResult = await ImportOrchestrator.getImportedConfigs(pluginManager, typeIds, valuesToImport)

    ctx.processFinished(ProcessName.IMPORT)
    reporter.displayImportResult(importResult);
  }

  static async getImportedConfigs(
    pluginManager: PluginManager,
    typeIds: string[],
    resources: ResourceConfig[],
  ): Promise<ImportResult> {
    const importedConfigs = [];
    const errors = [];

    for (const resource of resources) {
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
    }

    return {
      result: importedConfigs,
      errors,
    }
  }

  private static async parse(path: string): Promise<Project> {
    ctx.subprocessStarted(SubProcessName.PARSE);
    const project = await CodifyParser.parse(path);
    ctx.subprocessFinished(SubProcessName.PARSE);

    return project
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
}

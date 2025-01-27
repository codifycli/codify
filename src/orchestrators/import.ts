import { ResourceJson } from 'codify-schemas';

import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { Reporter } from '../ui/reporters/reporter.js';
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
    
    const requiredParameters = await pluginManager.getRequiredParameters(typeIds);
    const userSuppliedParameters = await reporter.promptUserForParameterValues(requiredParameters);

    const importResult = await ImportOrchestrator.getImportedConfigs(pluginManager, typeIds, userSuppliedParameters)

    ctx.processFinished(ProcessName.IMPORT)
    reporter.displayImportResult(importResult);
  }

  static async getImportedConfigs(
    pluginManager: PluginManager,
    typeIds: string[],
    userSuppliedParameters: UserSuppliedParameters
  ): Promise<ImportResult> {
    const importedConfigs = [];
    const errors = [];

    for (const type of typeIds) {
      ctx.subprocessStarted(SubProcessName.IMPORT_RESOURCE, type);
      try {
        const config: ResourceJson = {
          core: { type },
          parameters: userSuppliedParameters.get(type) ?? {},
        };

        const response = await pluginManager.importResource(config);

        if (response.result !== null && response.result.length > 0) {
          importedConfigs.push(...response
            ?.result
            ?.map((r) => ResourceConfig.fromJson(r)) ?? []
          );
        } else {
          errors.push(`Unable to import resource '${type}', resource not found`);
        }
      } catch (error: any) {
        errors.push(error.message ?? error);
      }

      ctx.subprocessFinished(SubProcessName.IMPORT_RESOURCE, type);
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

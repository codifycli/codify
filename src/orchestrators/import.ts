import { ResourceConfig , ResourceConfig as SchemaResourceConfig } from 'codify-schemas';

import { InternalError } from '../common/errors.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { InitializeOrchestrator } from './initialize.js';

export type RequiredProperties = Map<string, RequiredProperty[]>;
export type UserSuppliedProperties = Map<string, Record<string, unknown>>;
export type ImportResult = { result: ResourceConfig[], errors: string[] }

export interface RequiredProperty {
  propertyName: string;
  propertyType: string;
  plugin: string;
}

export class ImportOrchestrator {
  static async initializeAndValidate(
    typeIds: string[],
    path: string,
    secureMode: boolean
  ): Promise<{
    project: Project;
    pluginManager: PluginManager;
  }> {
    if (typeIds.length === 0) {
      throw new InternalError('importAndGenerateConfigs called with no typeIds passed in');
    }

    ctx.processStarted(ProcessName.IMPORT)

    const project = await ImportOrchestrator.parse(path)

    const { dependencyMap, pluginManager } = await InitializeOrchestrator.initializePlugins(project, secureMode);
    await ImportOrchestrator.validate(typeIds, project, pluginManager, dependencyMap)

    return { project, pluginManager };
  }

  static async getRequiredParameters(
    typeIds: string[],
    pluginManager: PluginManager
  ): Promise<RequiredProperties> {
    ctx.subprocessStarted(SubProcessName.GET_REQUIRED_PARAMETERS);

    const allRequiredProperties = new Map<string, RequiredProperty[]>();
    for (const type of typeIds) {
      const resourceInfo = await pluginManager.getResourceInfo(type);

      const { schema } = resourceInfo;
      if (!schema) {
        continue;
      }

      const requiredPropertyNames = resourceInfo.import?.requiredParameters;
      if (!requiredPropertyNames || requiredPropertyNames.length === 0) {
        continue;
      }

      requiredPropertyNames
        .forEach((name) => {
          if (!allRequiredProperties.has(type)) {
            allRequiredProperties.set(type, []);
          }

          const propertyInfo = (schema.properties as any)[name];

          allRequiredProperties.get(type)!.push({
            propertyName: name,
            propertyType: propertyInfo.type ?? null,
            plugin: resourceInfo.plugin
          })
        });
    }

    ctx.subprocessFinished(SubProcessName.GET_REQUIRED_PARAMETERS);

    return allRequiredProperties;
  }

  static async getImportedConfigs(
    pluginManager: PluginManager,
    typeIds: string[],
    userSuppliedProperties: UserSuppliedProperties
  ): Promise<ImportResult> {
    const importedConfigs = [];
    const errors = [];

    for (const type of typeIds) {
      ctx.subprocessStarted(SubProcessName.IMPORT_RESOURCE, type);
      try {
        const config: SchemaResourceConfig = {
          type,
          ...userSuppliedProperties.get(type),
        };

        const response = await pluginManager.importResource(config);

        if (response.result !== null && response.result.length > 0) {
          importedConfigs.push(...response.result);
        } else {
          errors.push(`Unable to import resource '${type}', resource not found`);
        }
      } catch (error: any) {
        errors.push(error.message ?? error);
      }

      ctx.subprocessFinished(SubProcessName.IMPORT_RESOURCE, type);
    }

    ctx.processFinished(ProcessName.IMPORT)

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

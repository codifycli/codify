import { ResourceConfig as SchemaResourceConfig } from 'codify-schemas';

import { InternalError } from '../common/errors.js';
import { CommonOrchestrator } from '../common/orchestrator.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';
import { ajv } from '../utils/ajv.js';

export type RequiredProperties = Map<string, RequiredProperty[]>;
export type UserSuppliedProperties = Map<string, Record<string, unknown>>;

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

    ctx.processStarted(ProcessName.PLAN)

    const project = await ImportOrchestrator.parse(path)

    const { dependencyMap, pluginManager } = await CommonOrchestrator.initializePlugins(project, secureMode);
    await ImportOrchestrator.validate(typeIds, project, pluginManager, dependencyMap)

    return { project, pluginManager };
  }

  static async getRequiredParameters(
    typeIds: string[],
    pluginManager: PluginManager
  ): Promise<RequiredProperties> {
    const allRequiredProperties = new Map<string, RequiredProperty[]>();
    for (const type of typeIds) {
      const resourceInfo = await pluginManager.getResourceInfo(type);

      const { schema } = resourceInfo;
      if (!schema) {
        continue;
      }

      if ((schema.oneOf
          && Array.isArray(schema.oneOf)
          && schema.oneOf.some((s) => s.required))
        || (schema.anyOf
          && Array.isArray(schema.anyOf)
          && schema.anyOf.some((s) => s.required)
        ) || (schema.anyOf
          && Array.isArray(schema.anyOf)
          && schema.anyOf.some((s) => s.required
          )
        )
      ) {
        throw new Error(`Codify current doesn't support importing ${type} because it has variable required parameters (anyOf, oneOf, allOf). This may be supported in the future`)
      }

      const requiredPropertyNames = schema.required as null | string[];

      const requiredPropsOneOf = ImportOrchestrator.calculateRequiredParametersForOneOf(schema, resourceInfo.plugin);
      if (requiredPropsOneOf.length > 0) {
        allRequiredProperties.set(type, requiredPropsOneOf);
        continue;
      }

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

    return allRequiredProperties;
  }

  static async getImportedConfigs(
    pluginManager: PluginManager,
    typeIds: string[],
    userSuppliedProperties: UserSuppliedProperties
  ): Promise<SchemaResourceConfig[]> {
    const importedConfig = [];
    
    for (const type of typeIds) {
      const config: SchemaResourceConfig = {
        type,
        ...userSuppliedProperties.get(type),
      };
      
      const response = await pluginManager.importResource(config);
      if (response.result !== null && response.result.length > 0) {
        importedConfig.push(...response.result);
      }
    }
    
    return importedConfig;
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
  
  private static calculateRequiredParametersForOneOf(schema: any, plugin: string): RequiredProperty[] {
    const requiredParameters = new Array<RequiredProperty>();

    if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.some((obj) => obj.required)) {
       schema.oneOf
        .filter((s) => s.required)
        .flatMap((s) => s.required)
        .forEach((name) => {
          requiredParameters.push({
            propertyName: name,
            propertyType: schema.properties[name].type,
            plugin
          })
        });
    }
    
    return requiredParameters;
  }
}

import { InternalError } from '../common/errors.js';
import { CommonOrchestrator } from '../common/orchestrator.js';
import { Plan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { DependencyMap, PluginManager } from '../plugins/plugin-manager.js';

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
  ): Promise<Map<string, RequiredProperty[]>> {
    const allRequiredProperties = new Map<string, RequiredProperty[]>();
    for (const type of typeIds) {
      const resourceInfo = await pluginManager.getResourceInfo(type);

      const schema = resourceInfo.schema;
      if (!schema) {
        continue;
      }

      const requiredPropertyNames = schema.required as string[] | null;
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

    // const validationResults = await pluginManager.validate(project);
    // project.handlePluginResourceValidationResults(validationResults);

    ctx.subprocessFinished(SubProcessName.VALIDATE)
  }

  private promptUserForRequiredInfo(c) {

  }

  private static async plan(project: Project, pluginManager: PluginManager): Promise<Plan> {
    ctx.subprocessStarted(SubProcessName.GENERATE_PLAN)
    const plan = await pluginManager.getPlan(project);
    ctx.subprocessFinished(SubProcessName.GENERATE_PLAN)

    return plan;
  }
}

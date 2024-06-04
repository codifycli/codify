import { PlanResponseData, ResourceOperation, ValidateResponseData } from 'codify-schemas';

import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ctx, SubProcessName } from '../events/context.js';
import { groupBy } from '../utils/index.js';
import { Plugin } from './plugin.js';
import { PluginResolver } from './resolver.js';

type PluginName = string;
type ResourceTypeId = string;
export type DependencyMap = Map<ResourceTypeId, ResourceTypeId[]>;

const DEFAULT_PLUGINS = {
  'default': 'latest',
}

export class PluginManager {

  private plugins = new Map<PluginName, Plugin>()
  private resourceToPluginMapping = new Map<string, string>()
  private pluginToResourceMapping = new Map<string, string[]>()

  async initialize(project?: Project, secureMode = false): Promise<Map<string, string[]>> {
    const plugins = await this.resolvePlugins(project);

    for (const plugin of plugins) {
      this.plugins.set(plugin.name, plugin)
    }

    const dependencyMap = await this.initializePlugins(plugins, secureMode);
    return dependencyMap;
  }

  async validate(project: Project): Promise<ValidateResponseData[]> {
    const { resourceConfigs } = project;
    const pluginGroupedResourceConfigs = groupBy(
        resourceConfigs,
        (item) => this.resourceToPluginMapping.get(item.type)!
    );

    return Promise.all(
        Object.entries(pluginGroupedResourceConfigs).map(([pluginName, configs]) =>
            this.plugins.get(pluginName)!.validate(configs)
        )
    );
  }

  async getPlan(project: Project): Promise<PlanResponseData[]> {
    const result = new Array<PlanResponseData>();
    for (const config of project.evaluationOrder) {
      const pluginName = this.resourceToPluginMapping.get(config.type);
      if (!pluginName) {
        throw new Error(`Internal error: unable to determine plugin for validated resource: ${config.id}`);
      }

      const planResult = await this.plugins.get(pluginName)!.plan(config);

      result.push(planResult);
    }

    return result;
  }

  async apply(project: Project, planResponseData: PlanResponseData[]): Promise<void> {
    for (const plan of planResponseData) {
      const { resourceType } = plan;

      ctx.subprocessStarted(SubProcessName.APPLYING_RESOURCE, resourceType);

      const config = project.evaluationOrder.find((r) => r.type === resourceType);
      if (!config) {
        throw new Error(`Could not find plan ${resourceType}`)
      }

      const pluginName = this.resourceToPluginMapping.get(resourceType);
      if (!pluginName) {
        throw new Error(`Internal error: unable to determine plugin for apply: ${resourceType}`);
      }

      await this.plugins.get(pluginName)!.apply(plan);
      await this.validateApply(pluginName, config);

      ctx.subprocessFinished(SubProcessName.APPLYING_RESOURCE, resourceType);
    }
  }

  private async resolvePlugins(project?: Project): Promise<Plugin[]> {
    const pluginDefinitions: Record<string, string> = {
      ...DEFAULT_PLUGINS,
      ...project?.projectConfig?.plugins,
    };

    const configPlugins = await Promise.all(Object.entries(pluginDefinitions).map(([name, version]) =>
      PluginResolver.resolve(name, version)
    ));

    const existingPlugins = await PluginResolver.resolveExisting(Object.keys(pluginDefinitions));

    return [...existingPlugins, ...configPlugins];
  }

  private async initializePlugins(plugins: Plugin[], secureMode: boolean): Promise<Map<string, string[]>> {
    const responses = await Promise.all(
      plugins.map(async (p) => {
        const initializeResult = await p.initialize(secureMode);
        return [p.name, initializeResult.resourceDefinitions] as const
      })
    );

    const resourceMap = new Map<string, string[]>;

    for (const [pluginName, definitions] of responses) {
      for (const definition of definitions) {
        // Build resource to plugin mapping
        if (this.resourceToPluginMapping.has(definition.type)) {
          throw new Error(`Duplicated types between plugin ${this.resourceToPluginMapping.get(definition.type)} and ${pluginName}`)
        }

        this.resourceToPluginMapping.set(definition.type, pluginName);

        // Build plugin to resource mapping
        if (!this.pluginToResourceMapping.has(pluginName)) {
          this.pluginToResourceMapping.set(pluginName, []);
        }

        this.pluginToResourceMapping.get(pluginName)!.push(definition.type);

        // Build resource dependency map
        if (resourceMap.has(definition.type)) {
          throw new Error(`Duplicated types between plugins ${this.resourceToPluginMapping.get(definition.type)} and ${pluginName}`);
        }

        resourceMap.set(definition.type, definition.dependencies)
      }
    }

    return resourceMap;
  }

  private async validateApply(pluginName: string, desired: ResourceConfig): Promise<void> {
    const validationPlan = await this.plugins.get(pluginName)!.plan(desired);
    if (validationPlan.operation !== ResourceOperation.NOOP) {
      throw new Error(`Plugin: '${pluginName}'. Resource: '${desired.type}'. Apply validation was not successful (additional changes are needed to match the desired plan).
        
Validation plan returned: ${validationPlan.operation}.
      `)
    }
  }

}

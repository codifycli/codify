import {
  ImportResponseData, ResourceDefinition,
  ResourceJson,
  ValidateResponseData,
} from '@codifycli/schemas';

import { InternalError } from '../common/errors.js';
import { config } from '../config.js';
import { Plan, ResourcePlan } from '../entities/plan.js';
import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ResourceInfo } from '../entities/resource-info.js';
import { SubProcessName, ctx } from '../events/context.js';
import { groupBy } from '../utils/index.js';
import { registerKillListeners } from '../utils/register-kill-listeners.js';
import { Plugin } from './plugin.js';
import { PluginResolver } from './resolver.js';
import { VerbosityLevel } from '../utils/verbosity-level.js';

type PluginName = string;
type ResourceTypeId = string;
export type ResourceDefinitionMap = Map<ResourceTypeId, ResourceDefinition>;

const DEFAULT_PLUGINS = {
  'default': 'latest',
}

const BETA_DEFAULT_PLUGINS = {
  'default': 'beta',
}

export class PluginManager {

  private plugins = new Map<PluginName, Plugin>()
  private resourceToPluginMapping = new Map<string, string>()
  private pluginToResourceMapping = new Map<string, string[]>()

  async initialize(project: Project | null, secureMode = false, verbosityLevel = 0): Promise<ResourceDefinitionMap> {
    const plugins = await this.resolvePlugins(project);

    for (const plugin of plugins) {
      this.plugins.set(plugin.name, plugin)
    }

    registerKillListeners(() => {
      for (const plugin of plugins) {
        plugin.kill()
      }
    });
    return this.initializePlugins(plugins, secureMode, verbosityLevel);
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

  async getMultipleResourceInfo(typeIds: string[]): Promise<ResourceInfo[]> {
    return Promise.all(typeIds.map((type) => this.getResourceInfo(type)))
  }

  async getResourceInfo(type: string): Promise<ResourceInfo> {
    const pluginName = this.resourceToPluginMapping.get(type);
    if (!pluginName) {
      throw new Error(`Unable to find plugin for resource: ${type}`);
    }

    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Unable to find plugin for resource ${type}`);
    }

    const result = await plugin.getResourceInfo(type);
    return ResourceInfo.fromResponseData(result);
  }

  async match(resource: ResourceConfig, array: ResourceConfig[]): Promise<ResourceConfig | null> {
    const pluginName = this.resourceToPluginMapping.get(resource.type);
    if (!pluginName) {
      throw new Error(`Unable to find plugin for resource: ${resource.type}`);
    }

    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Unable to find plugin for resource ${resource.type}`);
    }

    const { match } = await plugin.match(resource, array);
    if (!match) {
      return null;
    }

    return ResourceConfig.fromJson(match);
  }


  async importResource(config: ResourceJson, autoImportAll = false): Promise<ImportResponseData> {
    const pluginName = this.resourceToPluginMapping.get(config.core.type);
    if (!pluginName) {
      throw new Error(`Unable to find plugin for resource: ${config.core.type}`);
    }

    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`Unable to find plugin for resource ${config.core.type}`);
    }

    return plugin.import(config, autoImportAll);
  }

  async plan(project: Project): Promise<Plan> {
    const result = new Array<ResourcePlan>();
    await Promise.all(
      project.evaluationOrder!.map(async (id) => {
        const planRequest = project.getPlanRequest(id)!;

        const pluginName = this.resourceToPluginMapping.get(planRequest.core.type);
        if (!pluginName) {
          throw new InternalError(`Unable to determine plugin for validated resource: ${planRequest.core.type}`);
        }

        const planResult = await this.plugins.get(pluginName)!.plan(planRequest);

        result.push(planResult);
      })
    )

    return new Plan(result, project);
  }

  async apply(project: Project, plan: Plan): Promise<void> {
    for (const id of project.evaluationOrder ?? []) {
      ctx.subprocessStarted(SubProcessName.APPLYING_RESOURCE, id);

      const resourcePlan = plan.getResourcePlan(id);
      if (!resourcePlan) {
        throw new InternalError(`Could not find resourcePlan: ${id}`)
      }

      const { resourceType } = resourcePlan;
      const pluginName = this.resourceToPluginMapping.get(resourceType);
      if (!pluginName) {
        throw new InternalError(`Unable to determine plugin for apply: ${resourceType}`);
      }

      await this.plugins.get(pluginName)!.apply(resourcePlan);

      ctx.subprocessFinished(SubProcessName.APPLYING_RESOURCE, resourcePlan.id);
    }
  }

  async setVerbosityLevel(verbosityLevel: number): Promise<void> {
    VerbosityLevel.set(verbosityLevel);
    for (const plugin of this.plugins.values()) {
      await plugin.setVerbosityLevel(verbosityLevel);
    }
  }

  private async resolvePlugins(project: Project | null): Promise<Plugin[]> {
    const { isBeta } = config;

    // We handle beta plugins auto-magically currently. It will check that the version "beta" does not exist locally and
    // download every time (the intended behavior).
    const pluginDefinitions: Record<string, string> = {
      ...isBeta ? BETA_DEFAULT_PLUGINS : DEFAULT_PLUGINS,
      ...project?.projectConfig?.plugins,
    };

    return PluginResolver.resolveAll(pluginDefinitions);
  }

  private async initializePlugins(plugins: Plugin[], secureMode: boolean, verbosityLevel: number): Promise<Map<string, ResourceDefinition>> {
    const responses = await Promise.all(
      plugins.map(async (p) => {
        const initializeResult = await p.initialize(secureMode, verbosityLevel);
        return [p.name, initializeResult.resourceDefinitions] as const
      })
    );

    const resourceMap = new Map<string, ResourceDefinition>();

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

        resourceMap.set(definition.type, definition)
      }
    }

    return resourceMap;
  }
}

import { Plugin as PluginLibrary } from 'codify-plugin-lib'
import { GetResourceInfoResponseData, ImportResponseData, InitializeResponseData,
  PlanRequestData, ResourceJson, ValidateResponseData } from 'codify-schemas';

import { ResourcePlan } from '../../../src/entities/plan.js';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { IPlugin } from '../../../src/plugins/plugin.js';
import { MockResource } from './resource.js';

export class MockPlugin implements IPlugin {
  name = 'default';
  version = '0.0.0'
  path = '/'
  plugin!: PluginLibrary;
  
  async initialize(secureMode: boolean): Promise<InitializeResponseData> {
    this.plugin = PluginLibrary.create(
      'default',
      [new MockResource()],
    );

    return this.plugin.initialize();
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    return this.plugin.validate({ configs: configs.map((c) => c.toJson()) });
  }

  async getResourceInfo(type: string): Promise<GetResourceInfoResponseData> {
    return this.plugin.getResourceInfo({ type });
  }

  async import(config: ResourceJson): Promise<ImportResponseData> {
    return this.plugin.import(config)
  }

  async plan(request: PlanRequestData): Promise<ResourcePlan> {
    const data = await this.plugin.plan(request);

    return new ResourcePlan(data);
  }

  async apply(plan: ResourcePlan): Promise<void> {
    await this.plugin.apply({ plan })
  }
  
}

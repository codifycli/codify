import { Plugin } from 'codify-plugin-lib'
import { GetResourceInfoResponseData, ImportResponseData, InitializeResponseData, ResourceConfig as SchemaResourceConfig, ValidateResponseData } from 'codify-schemas';

import { ResourcePlan } from '../../../src/entities/plan.js';
import { PlanRequest } from '../../../src/entities/plan-request.js';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { MockResource } from './resource.js';

export class MockPlugin {
  name = 'default';
  version = '0.0.0'
  path = '/'

  plugin: Plugin;
  
  async initialize(secureMode: boolean): Promise<InitializeResponseData> {
    this.plugin = Plugin.create(
      'default',
      [new MockResource()],
    );

    return this.plugin.initialize();
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    const rawConfigs = configs.map((c) => c.raw);
    return this.plugin.validate({ configs: rawConfigs });
  }

  async getResourceInfo(type: string): Promise<GetResourceInfoResponseData> {
    return this.plugin.getResourceInfo({ type });
  }

  async import(config: SchemaResourceConfig): Promise<ImportResponseData> {
    return this.plugin.import({ config })
  }

  async plan(request: PlanRequest): Promise<ResourcePlan> {
    const data = await this.plugin.plan({
      desired: request.desired,
      state: request.state,
      isStateful: request.isStateful
    });

    return new ResourcePlan(data);
  }

  async apply(plan: ResourcePlan): Promise<void> {
    await this.plugin.apply({ plan })
  }
  
}

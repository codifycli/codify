import { Plugin as PluginLibrary } from '@codifycli/plugin-core'
import { FindInstancesResponseData, GetResourceInfoResponseData, ImportResponseData, InitializeResponseData,
  MatchResponseData,
  PlanRequestData, ResourceJson, ValidateResponseData
} from '@codifycli/schemas';

import { ResourcePlan } from '../../../src/entities/plan.js';
import { ResourceConfig } from '../../../src/entities/resource-config.js';
import { IPlugin } from '../../../src/plugins/plugin.js';
import { OsUtils } from '../../../src/utils/os-utils.js';
import { getMockResources } from './get-mock-resources.js';

export class MockPlugin implements IPlugin {
  name = 'default';
  version = '0.0.0'
  path = '/'
  plugin!: PluginLibrary;
  
  async initialize(secureMode: boolean, verbosityLevel: number = 0): Promise<InitializeResponseData> {
    this.plugin = PluginLibrary.create(
      'default',
      getMockResources(),
    );

    const response = await this.plugin.initialize(secureMode, verbosityLevel);

    // Send requires explicitly (like plugins built with plugin-core >= 2.1) so the tests don't depend on the fallback
    // for older plugins: mock resources need xcode-tools on macOS, like most resources of the default plugin.
    return {
      ...response,
      resourceDefinitions: response.resourceDefinitions.map((d) => ({
        ...d,
        requires: d.type === 'mock' && OsUtils.isMacOS() ? ['xcode-tools'] : [],
      })),
    };
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    return this.plugin.validate({ configs: configs.map((c) => c.toJson()) });
  }

  async getResourceInfo(type: string): Promise<GetResourceInfoResponseData> {
    return this.plugin.getResourceInfo({ type });
  }

  async match(resource: ResourceConfig, array: ResourceConfig[]): Promise<MatchResponseData> {
    return this.plugin.match({ resource: resource.toJson(), array: array.map((r) => r.toJson()) });
  }

  async import(config: ResourceJson): Promise<ImportResponseData> {
    return this.plugin.import(config)
  }

  async findInstances(type: string): Promise<FindInstancesResponseData> {
    return this.plugin.findInstances({ core: { type } });
  }

  async plan(request: PlanRequestData): Promise<ResourcePlan> {
    const data = await this.plugin.plan(request);

    return new ResourcePlan(data);
  }

  async apply(plan: ResourcePlan): Promise<void> {
    await this.plugin.apply({ plan })
  }

  kill(): void {

  }
}

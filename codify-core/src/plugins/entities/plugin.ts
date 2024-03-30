import {
  InitializeResponseData,
  InitializeResponseDataSchema,
  PlanResponseData,
  PlanResponseDataSchema
} from 'codify-schemas';

import { ConfigBlock } from '../../entities/index.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ajv } from '../../utils/ajv.js';
import { PluginIpcBridge } from '../ipc-bridge.js';

const initializeResponseValidator = ajv.compile(InitializeResponseDataSchema);
const planResponseValidator = ajv.compile(PlanResponseDataSchema);

export class Plugin {

  ipcBridge?: PluginIpcBridge;

  name: string;
  path: string;
  resourceDependenciesMap = new Map<string, string[]>()

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
  }

  async initialize(ipcBridge?: PluginIpcBridge): Promise<InitializeResponseData> {
    ipcBridge = ipcBridge ?? await PluginIpcBridge.create(this.path);
    const initializeResponse = await ipcBridge.sendMessageForResult({ cmd: 'initialize' });

    if (!this.validateInitializeResponse(initializeResponse)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}`);
    }

    initializeResponse.resourceDefinitions.forEach((d) => {
      this.resourceDependenciesMap.set(d.type, d.dependencies)
    });

    return initializeResponse;
  }

  async validate(configs: ConfigBlock[]): Promise<string[]> {
    const response = await this.ipcBridge!.sendMessageForResult({ cmd: 'validate', data: { configs } });
    return response as string[];
  }

  async plan(resource: ResourceConfig): Promise<PlanResponseData> {
    const response = await this.ipcBridge!.sendMessageForResult({ cmd: 'plan', data: resource.raw });

    if (!this.validatePlanResponse(response)) {
      throw new Error(`Plugin error: plugin ${this.name} returned invalid plan response`)
    }

    return response;
  }

  destroy() {
    this.ipcBridge!.killPlugin();
  }

  private validateInitializeResponse(response: unknown): response is InitializeResponseData {
    if (initializeResponseValidator(response)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}. Error: ${initializeResponseValidator.errors}`)
    }

    return true;
  }

  private validatePlanResponse(response: unknown): response is PlanResponseData {
    if (planResponseValidator(response)) {
      throw new Error(`Invalid plan response from plugin: ${this.name}. Error: ${initializeResponseValidator.errors}`)
    }

    return true;
  }
}

import {
  InitializeResponseData,
  InitializeResponseDataSchema,
  MessageStatus,
  PlanResponseData,
  PlanResponseDataSchema,
  ValidateResponseData,
  ValidateResponseDataSchema
} from 'codify-schemas';

import { ResourcePlan } from '../entities/plan.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ajv } from '../utils/ajv.js';
import { PluginProcess } from './plugin-process.js';
import { PlanInput } from '../entities/plan-input.js';

const initializeResponseValidator = ajv.compile(InitializeResponseDataSchema);
const validateResponseValidator = ajv.compile(ValidateResponseDataSchema);
const planResponseValidator = ajv.compile(PlanResponseDataSchema);

export class Plugin {

  process?: PluginProcess;

  name: string;
  version: string;
  path: string;
  resourceDependenciesMap = new Map<string, string[]>()

  constructor(name: string, version: string, path: string) {
    this.name = name;
    this.version = version;
    this.path = path;
  }

  async initialize(secureMode: boolean): Promise<InitializeResponseData> {
    this.process = await PluginProcess.start(this.path, this.name, secureMode);

    const initializeResponse = await this.process.sendMessageForResult({ cmd: 'initialize', data: {} });

    if (!this.validateInitializeResponse(initializeResponse.data)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}`);
    }

    for (const d of initializeResponse.data.resourceDefinitions) {
      this.resourceDependenciesMap.set(d.type, d.dependencies)
    }

    return initializeResponse.data;
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    const rawConfigs = configs.map((c) => c.raw);
    const { data, status } = await this.process!.sendMessageForResult({ cmd: 'validate', data: { configs: rawConfigs } });
    
    if (status === MessageStatus.ERROR) {
      throw new Error(`Initialize error for plugin: "${this.name}" \n\n` + data);
    }

    if (!this.validateValidateResponse(data)) {
      throw new Error(`Plugin error: Invalid validate response from plugin: ${this.name}`);
    }

    return data;
  }

  async plan(planInput: PlanInput): Promise<ResourcePlan> {
    const { data, status } = await this.process!.sendMessageForResult({ cmd: 'plan', data: { desired: planInput.desired, state: planInput.state } });

    if (status === MessageStatus.ERROR) {
      throw new Error(`Plan error for plugin: "${this.name}", resource: "${planInput.type}" \n\n` + data);
    }

    if (!this.validatePlanResponse(data)) {
      throw new Error(`Plugin error: plugin ${this.name} returned invalid plan response: ${JSON.stringify(planResponseValidator.errors, null, 2)}`)
    }

    return new ResourcePlan(data);
  }

  async apply(plan: ResourcePlan): Promise<void> {
    const result = await this.process!.sendMessageForResult({ cmd: 'apply', data: { plan } });

    if (result.status === MessageStatus.ERROR) {
      throw new Error(`Apply error for plugin: "${this.name}", resource: "${plan.resourceType}" \n\n` + result.data);
    }
  }

  private validateInitializeResponse(response: unknown): response is InitializeResponseData {
    return initializeResponseValidator(response)
  }

  private validateValidateResponse(response: unknown): response is ValidateResponseData {
    return validateResponseValidator(response)
  }

  private validatePlanResponse(response: unknown): response is PlanResponseData {
    return planResponseValidator(response);
  }
}

import {
  InitializeResponseData,
  InitializeResponseDataSchema,
  PlanResponseData,
  PlanResponseDataSchema,
  ValidateResponseData,
  ValidateResponseDataSchema
} from 'codify-schemas';

import { ResourceConfig } from '../entities/resource-config.js';
import { ajv } from '../utils/ajv.js';
import { PluginProcess } from './plugin-process.js';

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

  async initialize(): Promise<InitializeResponseData> {
    this.process = await PluginProcess.start(this.path, this.name);

    const initializeResponse = await this.process.sendMessageForResult({ cmd: 'initialize', data: {} });

    if (!this.validateInitializeResponse(initializeResponse)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}`);
    }

    initializeResponse.resourceDefinitions.forEach((d) => {
      this.resourceDependenciesMap.set(d.type, d.dependencies)
    });

    return initializeResponse;
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    const rawConfigs = configs.map((c) => c.raw);
    const response = await this.process!.sendMessageForResult({ cmd: 'validate', data: { configs: rawConfigs } });

    if (!this.validateValidateResponse(response)) {
      throw new Error(`Invalid validate response from plugin: ${this.name}`);
    }

    return response;
  }

  async plan(resource: ResourceConfig): Promise<PlanResponseData> {
    const response = await this.process!.sendMessageForResult({ cmd: 'plan', data: resource.raw });

    if (!this.validatePlanResponse(response)) {
      throw new Error(`Plugin error: plugin ${this.name} returned invalid plan response`)
    }

    return response;
  }

  async apply(planId: string): Promise<void> {
    await this.process!.sendMessageForResult({ cmd: 'apply', data: { planId } });
  }

  destroy() {
    this.process!.killPlugin();
  }

  private validateInitializeResponse(response: unknown): response is InitializeResponseData {
    if (!initializeResponseValidator(response)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}. Error: ${initializeResponseValidator.errors}`)
    }

    return true;
  }

  private validateValidateResponse(response: unknown): response is ValidateResponseData {
    if (!validateResponseValidator(response)) {
      throw new Error(`Invalid validate response from plugin: ${this.name}. Error: ${initializeResponseValidator.errors}`)
    }

    return true;
  }

  private validatePlanResponse(response: unknown): response is PlanResponseData {
    if (!planResponseValidator(response)) {
      throw new Error(`Invalid plan response from plugin: ${this.name}. Error: ${initializeResponseValidator.errors}`)
    }

    return true;
  }
}

import {
  GetResourceInfoResponseData,
  GetResourceInfoResponseDataSchema,
  ImportResponseData,
  ImportResponseDataSchema,
  InitializeResponseData,
  InitializeResponseDataSchema,
  PlanRequestData,
  PlanResponseData,
  PlanResponseDataSchema,
  ResourceJson,
  ValidateResponseData,
  ValidateResponseDataSchema,
} from 'codify-schemas';

import { ResourcePlan } from '../entities/plan.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ajv } from '../utils/ajv.js';
import { PluginProcess } from './plugin-process.js';

const initializeResponseValidator = ajv.compile(InitializeResponseDataSchema);
const validateResponseValidator = ajv.compile(ValidateResponseDataSchema);
const getResourceInfoResponseValidator = ajv.compile(GetResourceInfoResponseDataSchema);
const importResponseValidator = ajv.compile(ImportResponseDataSchema);
const planResponseValidator = ajv.compile(PlanResponseDataSchema);

export interface IPlugin {
  initialize(secureMode: boolean): Promise<InitializeResponseData>;
  validate(configs: ResourceConfig[]): Promise<ValidateResponseData>;
  getResourceInfo(type: string): Promise<GetResourceInfoResponseData>;
  import(config: ResourceJson): Promise<ImportResponseData>;
  plan(request: PlanRequestData): Promise<ResourcePlan>;
  apply(plan: ResourcePlan): Promise<void>;
}

export class Plugin implements IPlugin {

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

    const initializeResponse = await this.process.sendMessageForResult('initialize', {});

    if (!this.validateInitializeResponse(initializeResponse.data)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}`);
    }

    for (const d of initializeResponse.data.resourceDefinitions) {
      this.resourceDependenciesMap.set(d.type, d.dependencies)
    }

    return initializeResponse.data;
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    const jsonConfigs = configs.map((c) => c.toJson());
    const result = await this.process!.sendMessageForResult('validate', { configs: jsonConfigs });
    
    if (!result.isSuccessful()) {
      throw new Error(`Validate error for plugin: "${this.name}" \n\n${JSON.stringify(result.data, null, 2)}`);
    }

    if (!this.validateValidateResponse(result.data)) {
      throw new Error(`Plugin error: Invalid validate response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async getResourceInfo(type: string): Promise<GetResourceInfoResponseData> {
    const result = await this.process!.sendMessageForResult('getResourceInfo', { type });

    if (!result.isSuccessful()) {
      throw new Error(`Unable to get info for resource: "${type}" from plugin: "${this.name}" \n\n` + result.data);
    }

    if (!this.validateGetResourceInfoResponse(result.data)) {
      throw new Error(`Plugin error: Invalid get resource info response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async import(config: ResourceJson): Promise<ImportResponseData> {
    const result = await this.process!.sendMessageForResult('import', config);

    if (!result.isSuccessful()) {
      throw new Error(`Unable import resource ${config.core.type} with plugin: "${this.name}" \n\n` + result.data);
    }

    if (!this.validateImportResponse(result.data)) {
      throw new Error(`Plugin error: Invalid import response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async plan(request: PlanRequestData): Promise<ResourcePlan> {
    const result = await this.process!.sendMessageForResult(
      'plan',
      request
    );

    if (!result.isSuccessful()) {
      throw new Error(`Plan error for plugin: "${this.name}", resource: "${request.core.type}" \n\n` + result.data);
    }

    if (!this.validatePlanResponse(result.data)) {
      throw new Error(`Plugin error: plugin ${this.name} returned invalid plan response: ${JSON.stringify(planResponseValidator.errors, null, 2)}`)
    }

    return new ResourcePlan(result.data);
  }

  async apply(plan: ResourcePlan): Promise<void> {
    const result = await this.process!.sendMessageForResult('apply', { plan });

    if (!result.isSuccessful()) {
      throw new Error(`Apply error for plugin: "${this.name}", resource: "${plan.resourceType}" \n\n` + result.data);
    }
  }

  kill() {
    this.process?.kill()
  }

  private validateInitializeResponse(response: unknown): response is InitializeResponseData {
    return initializeResponseValidator(response)
  }

  private validateValidateResponse(response: unknown): response is ValidateResponseData {
    return validateResponseValidator(response)
  }

  private validateGetResourceInfoResponse(response: unknown): response is GetResourceInfoResponseData {
    return getResourceInfoResponseValidator(response)
  }

  private validateImportResponse(response: unknown): response is ImportResponseData {
    return importResponseValidator(response)
  }

  private validatePlanResponse(response: unknown): response is PlanResponseData {
    return planResponseValidator(response);
  }
}

import {
  ErrorResponseDataSchema,
  GetResourceInfoResponseData,
  GetResourceInfoResponseDataSchema,
  ImportRequestData,
  ImportResponseData,
  ImportResponseDataSchema,
  InitializeResponseData,
  InitializeResponseDataSchema,
  MatchResponseData,
  MatchResponseDataSchema,
  PlanRequestData,
  PlanResponseData,
  PlanResponseDataSchema,
  PluginErrorData,
  ResourceJson,
  ValidateResponseData,
  ValidateResponseDataSchema,
} from '@codifycli/schemas';

import { ResourcePlan } from '../entities/plan.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { PluginError } from '../common/errors.js';
import { ajv } from '../utils/ajv.js';
import { PluginProcess } from './plugin-process.js';

const errorResponseValidator = ajv.compile(ErrorResponseDataSchema);
const initializeResponseValidator = ajv.compile(InitializeResponseDataSchema);
const validateResponseValidator = ajv.compile(ValidateResponseDataSchema);
const getResourceInfoResponseValidator = ajv.compile(GetResourceInfoResponseDataSchema);
const matchResponseValidator = ajv.compile(MatchResponseDataSchema);
const importResponseValidator = ajv.compile(ImportResponseDataSchema);
const planResponseValidator = ajv.compile(PlanResponseDataSchema);

export interface IPlugin {
  initialize(secureMode: boolean, verbosityLevel: number): Promise<InitializeResponseData>;
  validate(configs: ResourceConfig[]): Promise<ValidateResponseData>;
  getResourceInfo(type: string): Promise<GetResourceInfoResponseData>;
  match(resource: ResourceConfig, array: ResourceConfig[]): Promise<MatchResponseData>;
  import(config: ResourceJson): Promise<ImportResponseData>;
  plan(request: PlanRequestData): Promise<ResourcePlan>;
  apply(plan: ResourcePlan): Promise<void>;
  kill(): void;
}

export class Plugin implements IPlugin {

  process?: PluginProcess;
  name: string;
  version: string;
  path: string;

  constructor(name: string, version: string, path: string) {
    this.name = name;
    this.version = version;
    this.path = path;
  }

  async initialize(secureMode: boolean, verbosityLevel = 0): Promise<InitializeResponseData> {
    this.process = await PluginProcess.start(this.path, this.name, secureMode);

    const initializeResponse = await this.process.sendMessageForResult('initialize', { verbosityLevel });

    if (!this.validateInitializeResponse(initializeResponse.data)) {
      throw new Error(`Invalid initialize response from plugin: ${this.name}`);
    }

    return initializeResponse.data;
  }

  async validate(configs: ResourceConfig[]): Promise<ValidateResponseData> {
    const jsonConfigs = configs.map((c) => c.toJson());
    const result = await this.process!.sendMessageForResult('validate', { configs: jsonConfigs });

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, 'validate', this.toErrorData(result.data));
    }

    if (!this.validateValidateResponse(result.data)) {
      throw new Error(`Plugin error: Invalid validate response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async getResourceInfo(type: string): Promise<GetResourceInfoResponseData> {
    const result = await this.process!.sendMessageForResult('getResourceInfo', { type });

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, type, this.toErrorData(result.data));
    }

    if (!this.validateGetResourceInfoResponse(result.data)) {
      throw new Error(`Plugin error: Invalid get resource info response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async match(resource: ResourceConfig, array: ResourceConfig[]): Promise<MatchResponseData> {
    const result = await this.process!.sendMessageForResult('match', {
      resource: resource.toJson(),
      array: array.map((r) => r.toJson()),
    });

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, resource.type, this.toErrorData(result.data));
    }

    if (!this.validateMatchResponse(result.data)) {
      throw new Error(`Plugin error: Invalid get resource info response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async import(config: ResourceJson, autoSearchAll = false): Promise<ImportResponseData> {
    const result = await this.process!.sendMessageForResult('import', <ImportRequestData>{ ...config, autoSearchAll });

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, config.core.type, this.toErrorData(result.data));
    }

    if (!this.validateImportResponse(result.data)) {
      throw new Error(`Plugin error: Invalid import response from plugin: ${this.name}`);
    }

    return result.data;
  }

  async plan(request: PlanRequestData): Promise<ResourcePlan> {
    const result = await this.process!.sendMessageForResult('plan', request);

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, request.core.type, this.toErrorData(result.data));
    }

    if (!this.validatePlanResponse(result.data)) {
      throw new Error(`Plugin error: plugin ${this.name} returned invalid plan response: ${JSON.stringify(planResponseValidator.errors, null, 2)}`)
    }

    return new ResourcePlan(result.data);
  }

  async apply(plan: ResourcePlan): Promise<void> {
    const result = await this.process!.sendMessageForResult('apply', { plan });

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, plan.resourceType, this.toErrorData(result.data));
    }
  }

  async setVerbosityLevel(verbosityLevel: number): Promise<void> {
    const result = await this.process!.sendMessageForResult('setVerbosityLevel', { verbosityLevel });

    if (!result.isSuccessful()) {
      throw new PluginError(this.name, 'setVerbosityLevel', this.toErrorData(result.data));
    }
  }

  private toErrorData(data: unknown): PluginErrorData {
    if (errorResponseValidator(data)) {
      return data as unknown as PluginErrorData;
    }
    return { errorType: 'unknown', message: typeof data === 'string' ? data : JSON.stringify(data, null, 2) };
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

  private validateMatchResponse(response: unknown): response is MatchResponseData {
    return matchResponseValidator(response)
  }

  private validateImportResponse(response: unknown): response is ImportResponseData {
    return importResponseValidator(response)
  }

  private validatePlanResponse(response: unknown): response is PlanResponseData {
    return planResponseValidator(response);
  }
}

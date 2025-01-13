import { ParameterOperation, PlanResponseData, ResourceConfig, ResourceOperation } from 'codify-schemas';

import { Project } from './project.js';

export class Plan {
  raw: PlanResponseData[];
  resources: ResourcePlan[];
  project: Project;
  
  constructor(resourcePlans: ResourcePlan[], project: Project) {
    this.raw = resourcePlans.map((r) => r.raw);
    this.resources = resourcePlans
    this.project = project
  }
  
  getResourcePlan(id: string): ResourcePlan | null {
    return this.resources.find((r) => r.id === id) ?? null;
  }

  filterNoopResources(): Plan {
    return new Plan(this.resources.filter((r) => r.operation !== ResourceOperation.NOOP), this.project)
  }

  // If every operation is no-op then a plan is considered empty
  isEmpty() {
    return this.raw.every((r) => r.operation === ResourceOperation.NOOP);
  }

  *[Symbol.iterator](): Iterator<ResourcePlan> {
    for (const resource of this.resources) {
      yield resource;
    }
  }
}

export class ResourcePlan {
  raw: PlanResponseData;
  planId: string;
  operation: ResourceOperation;
  resourceName?: string;
  resourceType: string;
  isStateful: boolean;
  parameters: Array<{
    name: string;
    newValue: null | unknown;
    operation: ParameterOperation;
    previousValue: null | unknown;
  }>
  
  constructor(json: PlanResponseData) {
    this.raw = json;
    this.planId = json.planId;
    this.isStateful = json.isStateful
    this.operation = json.operation;
    this.resourceName = json.resourceName;
    this.resourceType = json.resourceType;
    this.parameters = json.parameters;
  }
  
  get id(): string {
    return (this.resourceName) ? `${this.resourceType}.${this.resourceName}` : this.resourceType;
  }
  
  get desiredConfig(): ResourceConfig {
    return this.raw.parameters.reduce((obj, parameter) => {
      obj[parameter.name] = parameter.newValue;
      return obj;
    }, {} as ResourceConfig);
  }

  get currentConfig(): ResourceConfig {
    return this.raw.parameters.reduce((obj, parameter) => {
      obj[parameter.name] = parameter.previousValue;
      return obj;
    }, {} as ResourceConfig);
  }
}

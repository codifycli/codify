import { ParameterOperation, PlanResponseData, ResourceConfig, ResourceOperation } from '@codifycli/schemas';

import { getId } from '../utils/index.js';
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

  // This sorting is necessary with parallel plans because the order may be jumbled in the process
  sortByEvalOrder(evalOrder: null | string[]) {
    if (!evalOrder) {
      return;
    }

    this.raw.sort((a, b) => {
      const aId = getId(a.resourceType, a.resourceName);
      const bId = getId(b.resourceType, b.resourceName);

      const indexA = evalOrder.indexOf(aId);
      const indexB = evalOrder.indexOf(bId);

      return indexA > indexB ? 1 : -1;
    });

    this.resources.sort((a, b) => {
      const aId = getId(a.resourceType, a.resourceName);
      const bId = getId(b.resourceType, b.resourceName);

      const indexA = evalOrder.indexOf(aId);
      const indexB = evalOrder.indexOf(bId);

      return indexA > indexB ? 1 : -1;
    })
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

  computeTransitiveDependents(failedId: string): Set<string> {
    const reverseDeps = new Map<string, Set<string>>();
    for (const r of this.project.resourceConfigs) {
      for (const depId of r.dependencyIds) {
        if (!reverseDeps.has(depId)) reverseDeps.set(depId, new Set());
        reverseDeps.get(depId)!.add(r.id);
      }
    }

    const toSkip = new Set<string>();
    const queue = [failedId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = reverseDeps.get(current) ?? new Set();
      for (const dep of dependents) {
        if (!toSkip.has(dep)) {
          toSkip.add(dep);
          queue.push(dep);
        }
      }
    }
    return toSkip;
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
    isSensitive?: boolean;
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

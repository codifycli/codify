import { CreatePlan, DestroyPlan, ModifyPlan, ParameterChange, Resource, ResourceSettings } from 'codify-plugin-lib';
import { StringIndexedObject } from 'codify-schemas';

import schema from './resource-schema.json';
import { MockOs } from './system.js';

export interface MockResourceConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  directory?: string;
  array?: string[];
}

export class MockResource extends Resource<MockResourceConfig> {
  private typeId: string;

  constructor(typeId = 'mock') {
    super();
    this.typeId = typeId;
  }

  getSettings(): ResourceSettings<MockResourceConfig> {
    return {
      id: this.typeId,
      schema,
      parameterSettings: {
        propB: { type: 'number' },
        directory: { type: 'directory' },
        array: { type: 'array' }
      }
    }
  }

  async refresh(): Promise<Array<Partial<MockResourceConfig>> | Partial<MockResourceConfig> | null> {
    return MockOs.refresh(this.typeId);
  }

  async create(plan: CreatePlan<MockResourceConfig>): Promise<void> {
    return MockOs.create(this.typeId, plan.desiredConfig);
  }

  async modify(pc: ParameterChange<MockResourceConfig>, plan: ModifyPlan<MockResourceConfig>): Promise<void> {
    return MockOs.modify(this.typeId, plan.desiredConfig);
  }

  async destroy(plan: DestroyPlan<MockResourceConfig>): Promise<void> {
    return MockOs.destroy(this.typeId);
  }
}

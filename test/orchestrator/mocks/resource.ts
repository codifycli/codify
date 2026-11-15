import { CreatePlan, DestroyPlan, ModifyPlan, ParameterChange, Resource, ResourceSettings } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';

import { MockOs } from './system.js';

const schema = (await import('./resource-schema.json', { assert: { type: 'json' } })).default;

export interface MockResourceConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  directory?: string;
  array?: string[];
}

export class MockResource extends Resource<MockResourceConfig> {
  getSettings(): ResourceSettings<MockResourceConfig> {
    return {
      id: 'mock',
      schema,
      parameterSettings: {
        propB: { type: 'number' },
        directory: { type: 'directory' },
        array: { type: 'array', canModify: true }
      },
      importAndDestroy: {
        requiredParameters: ['propB'],
        refreshKeys: ['propB', 'directory'],
      },
      allowMultiple: {
        identifyingParameters: ['propA'],
        // MockOs only stores one instance per type. Return its identifying parameters if it exists
        findAllParameters: async () => {
          const current = MockOs.get<MockResourceConfig>(this.getSettings().id);
          return current ? [{ propB: current.propB }] : [];
        },
      }
    }
  }

  async refresh(parameters: Partial<MockResourceConfig>): Promise<Array<Partial<MockResourceConfig>> | Partial<MockResourceConfig> | null> {
    return MockOs.refresh(this.getSettings().id);
  }

  async create(plan: CreatePlan<MockResourceConfig>): Promise<void> {
    return MockOs.create(this.getSettings().id, plan.desiredConfig);
  }

  async modify(pc: ParameterChange<MockResourceConfig>, plan: ModifyPlan<MockResourceConfig>): Promise<void> {
    return MockOs.modify(this.getSettings().id, plan.desiredConfig);
  }

  async destroy(plan: DestroyPlan<MockResourceConfig>): Promise<void> {
    return MockOs.destroy(this.getSettings().id);
  }
}

// Codify will always try to install xcode-tools
export class MockXcodeToolsResource extends MockResource {
  getSettings(): ResourceSettings<MockResourceConfig> {
    return {
      id: 'xcode-tools',
    }
  }
}

export interface MockActionConfig extends StringIndexedObject {
  action: string;
  condition?: string;
}

// Records every refresh so tests can check that a condition never runs before it was approved
export const mockActionRefreshes: string[] = [];

export class MockActionResource extends Resource<MockActionConfig> {
  getSettings(): ResourceSettings<MockActionConfig> {
    return {
      id: 'action',
      schema: {
        type: 'object',
        properties: { action: { type: 'string' }, condition: { type: 'string' } },
        required: ['action'],
        additionalProperties: false,
      },
      allowMultiple: true,
    }
  }

  async refresh(parameters: Partial<MockActionConfig>): Promise<Partial<MockActionConfig> | null> {
    mockActionRefreshes.push(parameters.action!);
    return null;
  }

  async create(): Promise<void> {}

  async destroy(): Promise<void> {}
}

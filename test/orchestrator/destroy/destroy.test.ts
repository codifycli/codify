import path from 'path';
import { DestroyOrchestrator } from '../../../src/orchestrators/destroy.js';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { Plan } from '../../../src/entities/plan.js';
import { ResourceOperation } from '@codifycli/schemas';
import { MockReporter } from '../mocks/reporter.js';
import { MockResource, MockResourceConfig } from '../mocks/resource';
import { ResourceSettings } from 'codify-plugin-lib';
import { ResourceInfo } from '../../../src/entities/resource-info';
import { ResourceConfig } from '../../../src/entities/resource-config';

vi.mock('../mocks/get-mock-resources.js', async () => {
  return {
    getMockResources: () => ([
      new class extends MockResource {
        getSettings(): ResourceSettings<MockResourceConfig> {
          const orgSettings = super.getSettings();
          return {
            ...orgSettings,
            allowMultiple: {
              identifyingParameters: ['propA'],
            }
          }
        }
      }
    ])
  }
})

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

describe('Destroy orchestrator tests', () => {
  it('Can destroy a resource', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.DESTROY,
        });
      },
      promptUserForValues(info: ResourceInfo[]): ResourceConfig[] {
        expect(info.length).to.eq(1);
        expect(info[0]).toMatchObject({
          type: 'mock',
          importAndDestroy: {
            requiredParameters: expect.arrayContaining(['propB']),
          }
        })

        return [new ResourceConfig({
          type: 'mock',
          propA: 'current',
          propB: 1,
        })]
      }
    });

    MockOs.create('mock', {
      propA: 'current',
      propB: 1,
      array: ['a', 'b', 'c'],
      directory: '~/home'
    })

    expect(MockOs.get('mock')).to.toMatchObject({ propA: 'current' })

    await DestroyOrchestrator.run({
      typeIds: ['mock'],
      path: path.join(__dirname, 'simple.codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Can handle a destroy call on a resource that doesn\'t exist', { timeout: 3000000 }, async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.NOOP,
        });
      },
      promptUserForValues(info: ResourceInfo[]): ResourceConfig[] {
        expect(info.length).to.eq(1);
        expect(info[0]).toMatchObject({
          type: 'mock',
          importAndDestroy: {
            requiredParameters: expect.arrayContaining(['propB']),
          }
        })

        return [new ResourceConfig({
          type: 'mock',
          propA: 'current',
          propB: 1,
        })]
      }
    });

    await DestroyOrchestrator.run({
      typeIds: ['mock'],
      path: path.join(__dirname, 'codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Can handle destroying only one resource', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.DESTROY,
        });
      },
      promptUserForValues(info: ResourceInfo[]): ResourceConfig[] {
        expect(info.length).to.eq(1);
        expect(info[0]).toMatchObject({
          type: 'mock',
          importAndDestroy: {
            requiredParameters: expect.arrayContaining(['propB']),
          }
        })

        return [new ResourceConfig({
          type: 'mock',
          propA: 'current',
          propB: 1,
        })]
      }
    });

    MockOs.create('mock', {
      propA: 'current', // This is the identifying parameter and it matches the config
      propB: 1,
      array: ['a', 'b', 'c'],
      directory: '~/home'
    })

    expect(MockOs.get('mock')).to.toMatchObject({ propA: 'current' })

    await DestroyOrchestrator.run({
      typeIds: ['mock.0'],
      path: path.join(__dirname, 'codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.be.undefined;
  });

  // TODO: To be implemented
  it('Works with resources with required parameters', async () => {
    // const reporter = new MockReporter({
    //   validatePlan(plan: Plan) {
    //     expect(plan.getResourcePlan('mock.0')).toMatchObject({
    //       operation: ResourceOperation.DESTROY,
    //     });
    //     expect(plan.getResourcePlan('mock.1')).to.be.null;
    //   }
    // });
    //
    // MockOs.create('mock', {
    //   propA: 'current',
    //   propB: 1,
    //   array: ['a', 'b', 'c'],
    //   directory: '~/home'
    // })
    //
    // expect(MockOs.get('mock')).to.toMatchObject({ propA: 'current' })
    //
    // await DestroyOrchestrator.run({
    //   ids: ['mock'],
    //   path: '',
    // }, reporter)
    //
    // expect(MockOs.get('mock')).to.be.undefined;
  });

  afterEach(() => {
    vi.resetAllMocks();
    MockOs.reset();
  })

})

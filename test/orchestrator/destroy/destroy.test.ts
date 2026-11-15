import path from 'path';
import { DestroyOrchestrator } from '../../../src/orchestrators/destroy.js';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { Plan } from '../../../src/entities/plan.js';
import { ResourceOperation } from '@codifycli/schemas';
import { MockReporter } from '../mocks/reporter.js';
import { MockResource, MockResourceConfig } from '../mocks/resource';
import { ResourceSettings } from '@codifycli/plugin-core';
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
            // Destroy discovery uses findInstances, so resources that can't be imported (ex: alias) still list instances
            importAndDestroy: { ...orgSettings.importAndDestroy, preventImport: true },
            allowMultiple: {
              ...(orgSettings.allowMultiple as object),
              identifyingParameters: ['propA'],
            }
          }
        }
      }
    ])
  }
})

// In-process MockPlugins spawn BackgroundPtys that are never killed between tests. On Linux their
// pending writes can land in the pty validateShell spawns (fd reuse), causing spurious failures.
vi.mock('../../../src/utils/shell.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/utils/shell.js')>();
  return {
    ...actual,
    ShellUtils: {
      ...actual.ShellUtils,
      validateShell: vi.fn(async () => {}),
    },
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

  it('Lists existing instances and destroys the selected one', async () => {
    const promptUserForValues = vi.fn(() => []);
    const promptOptions = vi.fn((message: string, options: string[]) => {
      expect(message).to.contain('"mock"');
      expect(options).toEqual(['propB: 1', 'Enter the values manually']);
      return 0;
    });

    const reporter = new MockReporter({
      promptOptions,
      promptUserForValues,
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock')).toMatchObject({ operation: ResourceOperation.DESTROY });
      },
    });

    MockOs.create('mock', { propA: 'current', propB: 1, directory: '~/home' });

    await DestroyOrchestrator.run({ typeIds: ['mock'], path: path.join(__dirname, 'codify.json') }, reporter);

    expect(promptOptions).toHaveBeenCalledTimes(1);
    expect(promptUserForValues).not.toHaveBeenCalled();
    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Allows entering the values manually instead of selecting an instance', async () => {
    const promptUserForValues = vi.fn((info: ResourceInfo[]) => {
      expect(info.map((i) => i.type)).toEqual(['mock']);
      return [new ResourceConfig({ type: 'mock', propA: 'current', propB: 1 })];
    });

    const reporter = new MockReporter({
      promptOptions: (_, options) => options.length - 1, // 'Enter the values manually'
      promptUserForValues,
    });

    MockOs.create('mock', { propA: 'current', propB: 1, directory: '~/home' });

    await DestroyOrchestrator.run({ typeIds: ['mock'], path: path.join(__dirname, 'codify.json') }, reporter);

    expect(promptUserForValues).toHaveBeenCalledTimes(1);
    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Falls back to entering values manually when no instances exist', async () => {
    const promptOptions = vi.fn(() => 0);
    const promptUserForValues = vi.fn(() => [new ResourceConfig({ type: 'mock', propA: 'current', propB: 1 })]);

    const reporter = new MockReporter({ promptOptions, promptUserForValues });

    await DestroyOrchestrator.run({ typeIds: ['mock'], path: path.join(__dirname, 'codify.json') }, reporter);

    expect(promptOptions).not.toHaveBeenCalled();
    expect(promptUserForValues).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    vi.resetAllMocks();
    MockOs.reset();
  })

})

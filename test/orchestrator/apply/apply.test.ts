import path from 'path';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { Plan } from '../../../src/entities/plan.js';
import { ResourceOperation } from 'codify-schemas';
import { MockReporter } from '../mocks/reporter.js';
import { ApplyOrchestrator } from '../../../src/orchestrators/apply';
import {OsUtils} from "../../../src/utils/os-utils.js";

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

// The apply orchestrator directly calls plan so this will test both
describe('Apply orchestrator tests', () => {
  it('Can apply a resource (create)', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        if (OsUtils.isMacOS()) {
          // Xcode-tools will always show up in the plan
          expect(plan.getResourcePlan('xcode-tools')).toMatchObject({
            operation: ResourceOperation.NOOP
          })
        } else {
          // Xcode-tools should not be in linux or other os
          expect(plan.getResourcePlan('xcode-tools')).toMatchObject(null);
        }
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.CREATE,
        });
      },
      promptConfirmation(): boolean {
        return true;
      }
    });

    const applyConfirmationSpy = vi.spyOn(reporter, 'promptConfirmation');
    const applyCompleteSpy = vi.spyOn(reporter, 'displayMessage');

    console.log(MockOs.get('xcode-tools'))
    expect(MockOs.get('mock')).to.be.undefined;

    await ApplyOrchestrator.run({
      path: path.join(__dirname, 'create.codify.json')
    }, reporter)

    expect(applyConfirmationSpy).toHaveBeenCalledOnce();
    expect(applyCompleteSpy).toHaveBeenCalledOnce();

    // This is two because the system by default has xcode-tools installed
    // Codify is designed to always install xcode-tools regardless since a lot of the handlers depends on it.
    expect(MockOs.getAll().size).to.eq(2);

    // These values are form the create.codify.json file. Check that they were applied to the system
    expect(MockOs.get('mock')).toMatchObject({
      propA: 'abc',
      propB: 123,
      directory: '/home'
    })
  });

  it('Installs xcode-tools if it doesnt exist', { skip: !OsUtils.isMacOS() }, async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('xcode-tools')).toMatchObject({
          operation: ResourceOperation.CREATE,
        });
      },
      promptConfirmation(): boolean {
        return true;
      }
    });

    const applyConfirmationSpy = vi.spyOn(reporter, 'promptConfirmation');
    const applyCompleteSpy = vi.spyOn(reporter, 'displayMessage');

    MockOs.destroy('xcode-tools');
    expect(MockOs.get('xcode-tools')).to.be.undefined;

    await ApplyOrchestrator.run({
      path: path.join(__dirname, 'xcode-tools.codify.json')
    }, reporter)

    expect(applyConfirmationSpy).toHaveBeenCalledOnce();
    expect(applyCompleteSpy).toHaveBeenCalledOnce();

    // This is two because the system by default has xcode-tools installed
    // Codify is designed to always install xcode-tools regardless since a lot of the handlers depends on it.
    expect(MockOs.getAll().size).to.eq(1);

    // These values are form the codify.json file. Check that they were applied to the system
    expect(MockOs.get('xcode-tools')).toMatchObject({})
  });

  it('Can apply a resource (re-create)', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        // As always these values are from recreate.codify.json
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.RECREATE,
          parameters: expect.arrayContaining([
            expect.objectContaining({
              name: 'propA',
              previousValue: 'current',
              newValue: 'current',
              operation: 'noop'
            }),
            expect.objectContaining({
              name: 'propB',
              previousValue: 1,
              newValue: 0,
              operation: 'modify'
            }),
            // Special array filtering logic is happening here. Even though we requested ['a', 'b'] and the system has
            // ['a', 'b', 'c'], we won't try to delete the additional elements.
            expect.objectContaining({
              name: 'array',
              previousValue: expect.arrayContaining(['a', 'b']),
              newValue: expect.arrayContaining(['a', 'b']),
              operation: 'noop'
            }),
            expect.objectContaining({
              name: 'directory',
              previousValue: '~/home',
              newValue: '/home',
              operation: 'modify'
            })
          ])
        });
      }
    });

    MockOs.create('mock', {
      propA: 'current',
      propB: 1,
      array: ['a', 'b', 'c'],
      directory: '~/home'
    })

    await ApplyOrchestrator.run({
      path: path.join(__dirname, 'recreate.codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.toMatchObject({
      propA: 'current',
      propB: 0,
      array: ['a', 'b'],
      directory: '/home'
    })
  });

  // Very similar to the re-create test except that this time only the array is changed (which is modifiable)
  it('Can apply a resource (modify)', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        // As always these values are from modfiy.codify.json
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.MODIFY,
          parameters: expect.arrayContaining([
            expect.objectContaining({
              name: 'propA',
              previousValue: 'current',
              newValue: 'current',
              operation: 'noop'
            }),
            expect.objectContaining({
              name: 'propB',
              previousValue: 1,
              newValue: 1,
              operation: 'noop'
            }),
            // Special array filtering logic is happening here. Even though we requested ['a', 'b'] and the system has
            // ['a', 'b', 'c'], we won't try to delete the additional elements.
            expect.objectContaining({
              name: 'array',
              previousValue: expect.arrayContaining(['a', 'b', 'c']),
              newValue: expect.arrayContaining(['a', 'b', 'c', 'd']),
              operation: 'modify'
            }),
            expect.objectContaining({
              name: 'directory',
              previousValue: '/home',
              newValue: '/home',
              operation: 'noop'
            })
          ])
        });
      }
    });

    MockOs.create('mock', {
      propA: 'current',
      propB: 1,
      array: ['a', 'b', 'c'],
      directory: '/home'
    })

    await ApplyOrchestrator.run({
      path: path.join(__dirname, 'modify.codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.toMatchObject({
      propA: 'current',
      propB: 1,
      array: ['a', 'b', 'c', 'd'],
      directory: '/home'
    })
  });

  afterEach(() => {
    vi.resetAllMocks();
    MockOs.reset();
  })

})

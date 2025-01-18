import path from 'path';
import { DestroyOrchestrator } from '../../../src/orchestrators/destroy.js';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { Plan } from '../../../src/entities/plan.js';
import { ResourceOperation } from 'codify-schemas';
import { MockReporter } from '../mocks/reporter.js';
import { ApplyOrchestrator } from '../../../src/orchestrators/apply';
import { PlanOrchestrator } from '../../../src/orchestrators/plan';

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

// The apply orchestrator directly calls plan so this will test both
describe('Plan orchestrator tests', () => {
  it('Can plan a resource (create) including xcode-tools', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        // Xcode-tools will always show up in the plan
        expect(plan.getResourcePlan('xcode-tools')).toMatchObject({
          operation: ResourceOperation.CREATE
        })
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.CREATE,
        });
      },
      promptApplyConfirmation(): boolean {
        return true;
      }
    });

    MockOs.destroy('xcode-tools');
    expect(MockOs.get('xcode-tools')).to.be.undefined;
    expect(MockOs.get('mock')).to.be.undefined;

    const {plan, project, pluginManager} = await PlanOrchestrator.run({
      path: path.join(__dirname, 'create.codify.json')
    }, reporter)

    expect(plan).to.exist;
    expect(project).to.exist;
    expect(pluginManager).to.exist;

    expect(project.evaluationOrder.length).to.eq(2);
    expect(project.evaluationOrder[0]).to.eq('xcode-tools');
    expect(project.evaluationOrder[1]).to.eq('mock');

    // Nothing should be changed in the plan
    expect(MockOs.get('xcode-tools')).to.be.undefined;
    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Prioritizes xcode-tools in front of other resources', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        // Xcode-tools will always show up in the plan
        expect(plan.getResourcePlan('xcode-tools')).toMatchObject({
          operation: ResourceOperation.CREATE
        })
        expect(plan.getResourcePlan('mock.0')).toMatchObject({
          operation: ResourceOperation.CREATE,
        });
        expect(plan.getResourcePlan('mock.5')).toMatchObject({
          operation: ResourceOperation.CREATE,
        });
      },
      promptApplyConfirmation(): boolean {
        return true;
      }
    });

    MockOs.destroy('xcode-tools');
    expect(MockOs.get('xcode-tools')).to.be.undefined;
    expect(MockOs.get('mock')).to.be.undefined;

    const {plan, project, pluginManager} = await PlanOrchestrator.run({
      path: path.join(__dirname, 'create-xcode-tools.codify.json')
    }, reporter)

    expect(plan).to.exist;
    expect(project).to.exist;
    expect(pluginManager).to.exist;

    expect(project.evaluationOrder.length).to.eq(7);
    expect(project.evaluationOrder[0]).to.eq('xcode-tools');

    // Nothing should be changed in the plan
    expect(MockOs.get('xcode-tools')).to.be.undefined;
    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Can apply a resource (recreate)', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        // As always these values are from recreate.codify.json
        expect(plan.getResourcePlan('mock')).toMatchObject({
          operation: ResourceOperation.RECREATE,
          parameters: expect.arrayContaining([
            expect.objectContaining({
              name: 'propA',
              previousValue: 'current',
              newValue: 'newPropA',
              operation: 'modify'
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

    const {project, pluginManager, plan} = await PlanOrchestrator.run({
      path: path.join(__dirname, 'recreate.codify.json')
    }, reporter)

    expect(project).to.exist;
    expect(pluginManager).to.exist;
    expect(plan).to.exist;
    expect(project.evaluationOrder.length).to.eq(1);
  });

  afterEach(() => {
    vi.resetAllMocks();
    MockOs.reset();
  })

})

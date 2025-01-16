import path from 'path';
import { DestroyOrchestrator } from '../../../src/orchestrators/destroy.js';

import { describe, it, vi, afterEach, expect } from 'vitest';
import { MockOs } from '../mocks/system.js';
import { Plan } from '../../../src/entities/plan.js';
import { ResourceOperation } from 'codify-schemas';
import { MockReporter } from '../mocks/reporter.js';

vi.mock('../../../src/plugins/plugin.js', async () => {
  const { MockPlugin } = await import('../mocks/plugin.js');
  return { Plugin: MockPlugin };
})

describe('Destroy orchestrator tests', () => {
  it('Can destroy a resource (simple, no required attributes, from Codify.json)', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock.0')).toMatchObject({
          operation: ResourceOperation.DESTROY,
        });
        expect(plan.getResourcePlan('mock.1')).toMatchObject({
          operation: ResourceOperation.DESTROY,
        });
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
      ids: ['mock'],
      path: path.join(__dirname, 'codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Can handle a destroy call on a resource that doesn\'t exist', { timeout: 3000000 }, async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock.0')).toMatchObject({
          operation: ResourceOperation.NOOP,
        });
        expect(plan.getResourcePlan('mock.1')).toMatchObject({
          operation: ResourceOperation.NOOP,
        });
      }
    });

    await DestroyOrchestrator.run({
      ids: ['mock'],
      path: path.join(__dirname, 'codify.json')
    }, reporter)

    expect(MockOs.get('mock')).to.be.undefined;
  });

  it('Can handle destroying only one resource', async () => {
    const reporter = new MockReporter({
      validatePlan(plan: Plan) {
        expect(plan.getResourcePlan('mock.0')).toMatchObject({
          operation: ResourceOperation.DESTROY,
        });
        expect(plan.getResourcePlan('mock.1')).to.be.null;
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
      ids: ['mock.0'],
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

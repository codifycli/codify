import { expect, describe, it } from 'vitest';
import { ResourceOperation } from 'codify-schemas';

import { Plan, ResourcePlan } from './plan.js';
import { Project } from './project.js';
import { ResourceConfig } from './resource-config.js';

describe('Unit tests for Plan entity', () => {
  it('Can sort itself by eval order (useful since plans occur in parallel now and can be return in random order', () => {
    const project = new Project(
      null,
      [
        new ResourceConfig({ type: 'type1' }),
        new ResourceConfig({ type: 'type2', dependsOn: ['type1'] }),
        new ResourceConfig({ type: 'type3', dependsOn: ['type1', 'type2']}),
      ],
      './somewhere',
    );

    project.resolveDependenciesAndCalculateEvalOrder()
    console.log(project.evaluationOrder)

    expect(project.evaluationOrder!.length).to.eq(3);
    expect(project.evaluationOrder![0]).to.eq('type1');
    expect(project.evaluationOrder![1]).to.eq('type2');
    expect(project.evaluationOrder![2]).to.eq('type3');

    // Here we simulate receiving a plan that is out of order.
    const plan = new Plan([
      new ResourcePlan({
        planId: '1',
        operation: ResourceOperation.CREATE,
        resourceName: undefined,
        resourceType: 'type3',
        isStateful: false,
        parameters: []
      }),
      new ResourcePlan({
        planId: '1',
        operation: ResourceOperation.CREATE,
        resourceName: undefined,
        resourceType: 'type1',
        isStateful: false,
        parameters: []
      }),
      new ResourcePlan({
        planId: '1',
        operation: ResourceOperation.CREATE,
        resourceName: undefined,
        resourceType: 'type2',
        isStateful: false,
        parameters: []
      })
    ], project);

    expect(plan.raw.length).to.eq(3);
    expect(plan.raw[0].resourceType).to.eq('type3');
    expect(plan.raw[1].resourceType).to.eq('type1');
    expect(plan.raw[2].resourceType).to.eq('type2');

    expect(plan.resources.length).to.eq(3);
    expect(plan.resources[0].resourceType).to.eq('type3');
    expect(plan.resources[1].resourceType).to.eq('type1');
    expect(plan.resources[2].resourceType).to.eq('type2');

    plan.sortByEvalOrder(project.evaluationOrder);
    expect(plan.raw.length).to.eq(3);
    expect(plan.raw[0].resourceType).to.eq('type1');
    expect(plan.raw[1].resourceType).to.eq('type2');
    expect(plan.raw[2].resourceType).to.eq('type3');

    expect(plan.resources.length).to.eq(3);
    expect(plan.resources[0].resourceType).to.eq('type1');
    expect(plan.resources[1].resourceType).to.eq('type2');
    expect(plan.resources[2].resourceType).to.eq('type3');

  })
})

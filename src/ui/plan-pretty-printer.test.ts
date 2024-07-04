import { describe, it } from 'vitest';
import { prettyFormatResourcePlan } from './plan-pretty-printer.js';
import { ParameterOperation, PlanResponseData, ResourceOperation } from 'codify-schemas';
import { ResourcePlan } from '../entities/plan.js';

describe('Plan pretty printer', () => {
  it('Can print create plans', () => {
    const plan: PlanResponseData = {
      planId: 'id',
      resourceType: 'type',
      operation: ResourceOperation.CREATE,
      parameters: [
        { name: 'propC', previousValue: null, newValue: 'yui', operation: ParameterOperation.ADD },
        { name: 'propD', previousValue: null, newValue: 'qwe', operation: ParameterOperation.ADD },
        {
          name: 'propE',
          previousValue: null,
          newValue: ['10.0.0', '11.0.0', '9.0.0'],
          operation: ParameterOperation.ADD
        },
        { name: 'propF', previousValue: null, newValue: ['abc', 'def'], operation: ParameterOperation.ADD },
      ]
    }

    console.log(prettyFormatResourcePlan(new ResourcePlan(plan)))
  })

  it('Can print destroy plans', () => {
    const plan: PlanResponseData = {
      planId: 'id',
      resourceType: 'type',
      operation: ResourceOperation.DESTROY,
      parameters: [
        { name: 'propC', previousValue: 'yui', newValue: null, operation: ParameterOperation.REMOVE },
        { name: 'propD', previousValue: 'qwe', newValue: null, operation: ParameterOperation.REMOVE },
        {
          name: 'propE',
          previousValue: ['10.0.0', '11.0.0', '9.0.0'],
          newValue: null,
          operation: ParameterOperation.REMOVE
        },
        { name: 'propF', previousValue: ['abc', 'def'], newValue: null, operation: ParameterOperation.REMOVE },
      ]
    }

    console.log(prettyFormatResourcePlan(new ResourcePlan(plan)))
  })

  it('Can print modify and re-create plans', () => {
    const plan: PlanResponseData = {
      planId: 'id',
      resourceType: 'type',
      operation: ResourceOperation.RECREATE,
      parameters: [
        { name: 'propA', previousValue: 'abc', newValue: 'def', operation: ParameterOperation.MODIFY },
        {
          name: 'propALong',
          previousValue: 'abc\ndef',
          newValue: 'def\nteoewriu',
          operation: ParameterOperation.MODIFY
        },
        { name: 'propB', previousValue: 'xzy', newValue: 'xzy', operation: ParameterOperation.NOOP },
        { name: 'propC', previousValue: null, newValue: 'yui', operation: ParameterOperation.ADD },
        { name: 'propD', previousValue: 'qwe', newValue: null, operation: ParameterOperation.REMOVE },
        {
          name: 'propE',
          previousValue: ['10.0.0', '9.0.0'],
          newValue: ['10.0.0', '11.0.0'],
          operation: ParameterOperation.MODIFY
        },
        { name: 'propF', previousValue: null, newValue: ['abc', 'def'], operation: ParameterOperation.ADD },
      ]
    }

    console.log(prettyFormatResourcePlan(new ResourcePlan(plan)))
  })
});

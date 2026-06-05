import  { describe, it } from 'vitest';
import { ParameterOperation, PlanResponseData, ResourceOperation } from '@codifycli/schemas';
import { prettyFormatResourcePlan } from '../../src/ui/plan-pretty-printer.js';
import { ResourcePlan } from '../../src/entities/plan.js';

describe('Plan pretty printer', () => {
  it('Can print create plans', () => {
    const plan: PlanResponseData = {
      planId: 'id',
      resourceType: 'type',
      operation: ResourceOperation.CREATE,
      isStateful: false,
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
      isStateful: false,
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

  it('Can diff nested objects in modify plans', () => {
    const plan: PlanResponseData = {
      planId: 'id',
      resourceType: 'macos-settings',
      operation: ResourceOperation.MODIFY,
      isStateful: false,
      parameters: [
        {
          name: 'mouse',
          previousValue: { naturalScrolling: false },
          newValue: { naturalScrolling: true },
          operation: ParameterOperation.MODIFY,
          isSensitive: false,
        },
        {
          name: 'trackpad',
          previousValue: {
            tapToClick: true,
            scrollSpeed: 1,
            pointerSpeed: 3,
            naturalScrolling: false,
            twoFingerSwipe: true,
          },
          newValue: {
            tapToClick: true,
            scrollSpeed: 1,
            pointerSpeed: 5,
            naturalScrolling: false,
            twoFingerSwipe: true,
          },
          operation: ParameterOperation.MODIFY,
          isSensitive: false,
        },
      ]
    }

    console.log(prettyFormatResourcePlan(new ResourcePlan(plan)))
  })

  it('Can diff nested objects with adds, removes, and modifies', () => {
    const plan: PlanResponseData = {
      planId: '18d9dbbc-9dd1-4581-9a6a-db146d44c829',
      resourceType: 'macos-settings',
      operation: ResourceOperation.MODIFY,
      isStateful: false,
      parameters: [
        {
          name: 'mouse',
          previousValue: { naturalScrolling: true, speed: 1.5 },
          newValue: { naturalScrolling: false, speed: 1.5 },
          operation: ParameterOperation.MODIFY,
          isSensitive: false,
        },
        {
          name: 'keyboard',
          previousValue: { pressAndHold: false, fnKeysAsStandardKeys: true },
          newValue: { keyRepeat: 6, initialKeyRepeat: 68, pressAndHold: true, fnKeysAsStandardKeys: true },
          operation: ParameterOperation.MODIFY,
          isSensitive: false,
        },
        {
          name: 'dock',
          previousValue: { position: 'bottom', autohide: true, minimizeEffect: 'scale' },
          newValue: { position: 'bottom', autohide: false, showRecents: true, minimizeEffect: 'genie' },
          operation: ParameterOperation.MODIFY,
          isSensitive: false,
        },
      ]
    }

    console.log(prettyFormatResourcePlan(new ResourcePlan(plan)))
  })

  it('Can print modify and re-create plans', () => {
    const plan: PlanResponseData = {
      planId: 'id',
      resourceType: 'type',
      operation: ResourceOperation.RECREATE,
      isStateful: true,
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

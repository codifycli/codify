import { ResourceOperation } from '@codifycli/schemas';

import { PluginError } from '../common/errors.js';
import { ResourcePlan } from './plan.js';

export interface ApplyResultEntry {
  id: string;
  operation: ResourceOperation;
  status: 'success' | 'failed' | 'skipped';
  error?: PluginError;
}

export interface ApplyResult {
  entries: ApplyResultEntry[];
  errors: PluginError[];

  isPartialFailure(): boolean;
}

export function createApplyResult(
  succeededPlans: ResourcePlan[],
  failedErrors: PluginError[],
  skippedIds: Set<string>,
): ApplyResult {
  const failedByType = new Map(failedErrors.map((e) => [e.resourceType, e]));

  const entries: ApplyResultEntry[] = [
    ...succeededPlans.map((p) => ({
      id: p.id,
      operation: p.operation,
      status: 'success' as const,
    })),
    ...failedErrors.map((e) => ({
      id: e.resourceType,
      operation: ResourceOperation.NOOP,
      status: 'failed' as const,
      error: e,
    })),
    ...[...skippedIds].map((id) => ({
      id,
      operation: ResourceOperation.NOOP,
      status: 'skipped' as const,
    })),
  ];

  return {
    entries,
    errors: failedErrors,
    isPartialFailure() {
      return failedErrors.length > 0;
    },
  };
}

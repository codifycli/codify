import { ResourceOperation } from '@codifycli/schemas';

import { PluginError } from '../common/errors.js';
import { ApplyNote } from './apply-note.js';
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
  notes: ApplyNote[];

  isPartialFailure(): boolean;
}

export function createApplyResult(
  succeededPlans: ResourcePlan[],
  failedErrors: PluginError[],
  skippedIds: Set<string>,
  notes: ApplyNote[] = [],
): ApplyResult {
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
    notes,
    isPartialFailure() {
      return failedErrors.length > 0;
    },
  };
}

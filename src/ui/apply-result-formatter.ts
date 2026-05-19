import chalk from 'chalk';
import { ResourceOperation } from '@codifycli/schemas';

import { ApplyResultEntry } from '../entities/apply-result.js';

export function applyEntryLabel(entry: ApplyResultEntry): string {
  if (entry.status === 'failed') return 'failed';
  if (entry.status === 'skipped') return 'skipped';
  switch (entry.operation) {
    case ResourceOperation.CREATE: return 'installed';
    case ResourceOperation.DESTROY: return 'destroyed';
    case ResourceOperation.MODIFY:
    case ResourceOperation.RECREATE: return 'modified';
    default: return 'applied';
  }
}

export function applyEntryInkColor(entry: ApplyResultEntry): string {
  if (entry.status === 'failed') return 'red';
  if (entry.status === 'skipped') return 'gray';
  switch (entry.operation) {
    case ResourceOperation.CREATE: return 'green';
    case ResourceOperation.DESTROY: return 'red';
    case ResourceOperation.MODIFY:
    case ResourceOperation.RECREATE: return '#d4a017';
    default: return 'white';
  }
}

export function applyEntryChalkColor(entry: ApplyResultEntry): (s: string) => string {
  if (entry.status === 'failed') return chalk.red;
  if (entry.status === 'skipped') return chalk.gray;
  switch (entry.operation) {
    case ResourceOperation.CREATE: return chalk.green;
    case ResourceOperation.DESTROY: return chalk.red;
    case ResourceOperation.MODIFY:
    case ResourceOperation.RECREATE: return chalk.yellow;
    default: return (s) => s;
  }
}

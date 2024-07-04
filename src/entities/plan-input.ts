import { ResourceConfig } from './resource-config.js';
import { InternalError } from '../common/errors.js';

export class PlanInput {
  desired?: ResourceConfig
  state?: ResourceConfig

  constructor(
    desired?: ResourceConfig,
    state?: ResourceConfig,
  ) {
    if (!desired && !state) {
      throw new InternalError('Both desired and state cannot be undefined');
    }
  }

  get type(): string {
    return this.desired?.type ?? this.state?.type!
  }

  get id(): string {
    return this.desired?.id ?? this.state?.id!
  }
}

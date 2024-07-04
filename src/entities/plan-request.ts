import { ResourceConfig } from './resource-config.js';
import { InternalError } from '../common/errors.js';
import { ResourceConfig as SchemaResourceConfig } from 'codify-schemas/dist/types/index.js';

export class PlanRequest {
  private _desired?: ResourceConfig
  private _state?: ResourceConfig

  constructor(
    desired?: ResourceConfig,
    state?: ResourceConfig,
  ) {
    if (!desired && !state) {
      throw new InternalError('Both desired and state cannot be undefined');
    }

    this._desired = desired;
    this._state = state;
  }

  get type(): string {
    return this._desired?.type ?? this._state?.type!
  }

  get id(): string {
    return this._desired?.id ?? this._state?.id!
  }

  get desired(): SchemaResourceConfig | undefined {
    return this._desired?.raw;
  }

  get state(): SchemaResourceConfig | undefined {
    return this._state?.raw;
  }
}

import { PluginError } from '../common/errors.js';
import { ResourcePlan } from '../entities/plan.js';
import { prettyFormatResourcePlan } from './plan-pretty-printer.js';

export function formatApplyValidationError(error: PluginError): string {
  const plan = new ResourcePlan((error.errorData.data as any).plan);
  return [
    `Apply validation failed: resource "${plan.id}" did not reach its desired state.`,
    'Changes still needed:',
    prettyFormatResourcePlan(plan),
  ].join('\n');
}

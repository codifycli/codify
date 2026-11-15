import { Plan, ResourcePlan } from '../entities/plan.js';
import { TemplateExpander } from '../templates/template-expander.js';

/** Ex: "(from template @codify/node > nvm)". Empty string if the resource was declared in the project file. */
export function templateOriginLabel(plan: Plan, resourcePlan: ResourcePlan): string {
  const resource = plan.project.resourceConfigs.find((r) => r.id === resourcePlan.id)
    ?? plan.project.stateConfigs?.find((r) => r.id === resourcePlan.id);

  return resource ? TemplateExpander.describeOrigins(resource) : '';
}

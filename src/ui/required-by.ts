import type { Plan, ResourcePlan } from '../entities/plan.js';

export const AUTO_ADDED_BADGE = '✦ AUTO-ADDED';
// Violet: distinct from the operation colors (green, yellow, red) and readable with white text on dark and light themes
export const AUTO_ADDED_COLOR = '#7C3AED';
export const AUTO_ADDED_HINT = 'Prerequisites added automatically. Declare them in your config to customize them.';

const MAX_LISTED = 3;

/** Ids of the resources that made the CLI add this resource. Empty if it was declared in a file or a template. */
export function requiredByOf(plan: Plan, resourcePlan: ResourcePlan): string[] {
  return plan.project.resourceConfigs.find((r) => r.id === resourcePlan.id)?.requiredBy ?? [];
}

/** Ex: "required by cursor, git-lfs and 2 more" */
export function formatRequiredBy(ids: string[]): string {
  const listed = ids.slice(0, MAX_LISTED).join(', ');
  const rest = ids.length - MAX_LISTED;
  return `required by ${listed}${rest > 0 ? ` and ${rest} more` : ''}`;
}

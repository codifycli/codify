import { PlanResponseData } from 'codify-schemas';

export interface Reporter {
  promptConfirmation(): Promise<boolean>

  displayPlan(plan: PlanResponseData[]): void
}

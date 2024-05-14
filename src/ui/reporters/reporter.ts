import { PlanResponseData } from 'codify-schemas';

export enum RenderEvent {
  LOG = 'log',
  PROGRESS_UPDATE = 'progressUpdate',
  PROMPT_RESULT = 'promptResult',
  STATE_TRANSITION = 'stateTransition'
}

/**
 * Reporter to component (ink) communication is designed to be a state machine.
 */
export enum RenderState { // TODO: instead of having GENERATE_PLAN and APPLYING be separate states, they should be the same state. Because they cause the UI to behave in the same way
  GENERATING_PLAN,
  DISPLAY_PLAN,
  PROMPT_APPLY_CONFIRMATION,
  APPLYING,
}

export interface StateTransition {
  nextState: RenderState;
}

export interface DisplayPlanStateTransition extends StateTransition {
  plan: PlanResponseData[];
}

export interface Reporter {
  displayPlan(plan: PlanResponseData[]): void

  promptApplyConfirmation(): Promise<boolean>
}

import { PlanResponseData } from 'codify-schemas';

export enum RenderEvent {
  STATE_TRANSITION = 'stateTransition',
  LOG = 'log',
  PROCESS_UPDATE = 'processUpdate',
  PROMPT_RESULT = 'promptResult'
}

/**
 * Reporter to component (ink) communication is designed to be a state machine.
 */
export enum RenderState {
  GENERATING_PLAN,
  DISPLAY_PLAN,
  ASK_CONFIRMATION,
  APPLYING,
}

export interface StateTransition {
  nextState: RenderState;
}

export interface DisplayPlanStateTransition extends StateTransition {
  plan: PlanResponseData[];
}

export interface Reporter {
  promptConfirmation(): Promise<boolean>

  displayPlan(plan: PlanResponseData[]): void
}

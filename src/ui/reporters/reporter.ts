import { PlanResponseData, SudoRequestData, SudoRequestResponseData } from 'codify-schemas';

import { DebugReporter } from './debug-reporter.js';
import { DefaultReporter } from './default-reporter.js';
import { PlainReporter } from './plain-reporter.js';

export enum RenderEvent {
  CLEAR = 'promptSudo',
  LOG = 'log',
  PROGRESS_UPDATE = 'progressUpdate',
  PROMPT_RESULT = 'promptResult',
  STATE_TRANSITION = 'stateTransition',
  UNCLEAR = 'promptSudoResult',
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

  promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData>;
}

export enum ReporterType {
  DEBUG,
  DEFAULT,
  PLAIN,
  JSON
}

export const ReporterFactory = {
  create(type: ReporterType): Reporter {
    switch (type) {
      case ReporterType.DEBUG: {
        return new DebugReporter();
      }

      case ReporterType.PLAIN: {
        return new PlainReporter();
      }

      case ReporterType.JSON: {
        return new DefaultReporter();
      }

      default: {
        return new DefaultReporter();
      }
    }
  },
};

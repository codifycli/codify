import { SudoRequestData , SudoRequestResponseData } from 'codify-schemas';

import { Plan } from '../../entities/plan.js';
import { ImportResult, RequiredParameters, UserSuppliedParameters } from '../../orchestrators/import.js';
import { DebugReporter } from './debug-reporter.js';
import { DefaultReporter } from './default-reporter.js';
import { PlainReporter } from './plain-reporter.js';

export enum RenderEvent {
  LOG = 'log',
  PROGRESS_UPDATE = 'progressUpdate',
  PROMPT_CONFIRMATION_RESULT = 'promptConfirmation',
  PROMPT_SUDO = 'promptSudo',
  PROMPT_IMPORT_PARAMETERS = 'promptImportParameters',
  PROMPT_IMPORT_PARAMETERS_RESULT = 'promptImportParametersResult',
  PROMPT_SUDO_ERROR = 'promptSudoError',
  PROMPT_SUDO_GRANTED = 'promptSudoGranted',
  PROMPT_SUDO_RESULT = 'promptSudoResult',
  STATE_TRANSITION = 'stateTransition',
}

/**
 * Reporter to component (ink) communication is designed to be a state machine.
 */
export enum RenderState { // TODO: instead of having GENERATE_PLAN and APPLYING be separate states, they should be the same state. Because they cause the UI to behave in the same way
  GENERATING_PLAN,
  DISPLAY_PLAN,
  PROMPT_CONFIRMATION,
  APPLYING,
  APPLY_COMPLETE,
  DISPLAY_IMPORT_RESULT,
}

export interface StateTransition {
  nextState: RenderState;
}

export interface DisplayPlanStateTransition extends StateTransition {
  plan: Plan;
}

export interface Reporter {
  displayApplyComplete(message: string[]): Promise<void> | void;

  displayPlan(plan: Plan): void

  promptConfirmation(message: string): Promise<boolean>

  promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData>;
  
  askRequiredParametersForImport(requiredParameters: RequiredParameters): Promise<UserSuppliedParameters>;

  displayImportResult(importResult: ImportResult): void;
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
        return new DefaultReporter();
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

import { SudoRequestData , SudoRequestResponseData } from 'codify-schemas';

import { Plan } from '../../entities/plan.js';
import { ImportResult } from '../../orchestrators/import.js';
import { DefaultReporter } from './default-reporter.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { ResourceConfig } from '../../entities/resource-config.js';

export enum RenderEvent {
  LOG = 'log',
  PROGRESS_UPDATE = 'progressUpdate',
  PROMPT_RESULT = 'promptConfirmation',
  PROMPT_SUDO = 'promptSudo',
  DISABLE_SUDO_PROMPT = 'disableSudoPrompt',
  PROMPT_IMPORT_PARAMETERS = 'promptImportParameters',
  PROMPT_IMPORT_PARAMETERS_RESULT = 'promptImportParametersResult',
  PROMPT_SUDO_ERROR = 'promptSudoError',
  PROMPT_SUDO_GRANTED = 'promptSudoGranted',
  SUDO_PROMPT_RESULT = 'promptSudoResult',
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

export enum PromptType {
  IMPORT,
  DESTROY,
  CREATE,
}

export interface Reporter {
  displayPlan(plan: Plan): void

  promptConfirmation(message: string): Promise<boolean>

  promptOptions(message: string, options: string[]): Promise<string>;

  promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData>;

  promptUserForValues(resources: Array<ResourceInfo>, promptType: PromptType): Promise<ResourceConfig[]>;

  displayImportResult(importResult: ImportResult, showConfigs: boolean): void;

  displayFileModification(diff: string): void

  displayMessage(message: string): void
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

      // case ReporterType.PLAIN: {
      //   return new PlainReporter();
      // }

      case ReporterType.JSON: {
        return new DefaultReporter();
      }

      default: {
        return new DefaultReporter();
      }
    }
  },
};

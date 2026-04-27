import { CommandRequestData } from '@codifycli/schemas';

import { Plan, ResourcePlan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { DebugReporter } from './debug-reporter.js';
import { DefaultReporter } from './default-reporter.js';
import { JsonReporter } from './json-reporter.js';
import { PlainReporter } from './plain-reporter.js';
import { StubReporter } from './stub-reporter.js';

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
  TOGGLE_VERBOSITY = 'toggleVerbosity',
  SUDO_PASSWORD_TOGGLE = 'sudoPasswordToggle',
  SUDO_PASSWORD_CANCEL = 'sudoPasswordCancel',
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
  APPLY_VALIDATION_ERROR,
}

export enum PromptType {
  IMPORT,
  DESTROY,
  CREATE,
}

export interface Reporter {
  silent: boolean;

  displayPlan(plan: Plan): void

  displayInitBanner(): Promise<void>

  displayProgress(): Promise<void>;

  hide(): Promise<void>;

  promptInitResultSelection(availableTypes: string[]): Promise<string[]>;

  promptInput(prompt: string, error?: string, placeholder?: string): Promise<string>;

  promptConfirmation(message: string): Promise<boolean>

  promptOptions(message: string, options: string[]): Promise<number>;

  promptSudo(pluginName: string, data: CommandRequestData): Promise<string | undefined>;

  promptUserForValues(resources: Array<ResourceInfo>, promptType: PromptType): Promise<ResourceConfig[]>;

  promptPressKeyToContinue(message?: string): Promise<void>;

  displayImportResult(importResult: ImportResult, showConfigs: boolean): void;

  displayFileModifications(diff: Array<{ file: string, modification: FileModificationResult }>): void

  displayMessage(message: string): Promise<void>

  displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void>

  setRawMode(): Promise<void>

  disableRawMode(): Promise<void>

  displayApplyValidationError(resourcePlan: ResourcePlan): Promise<void>;
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
        return new JsonReporter();
      }

      default: {
        return new DefaultReporter();
      }
    }
  },
};

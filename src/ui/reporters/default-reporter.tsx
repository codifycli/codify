import { FormProps, FormReturnValue } from '@codifycli/ink-form';
import chalk from 'chalk';
import { CommandRequestData } from '@codifycli/schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { Plan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { Event, ProcessName, SubProcessName, ctx } from '../../events/context.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { sleep } from '../../utils/index.js';
import { SudoUtils } from '../../utils/sudo.js';
import { DefaultComponent } from '../components/default-component.js';
import { ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { RenderStatus, store } from '../store/index.js';
import { PromptType, RenderEvent, Reporter } from './reporter.js';

const ProgressLabelMapping = {
  [ProcessName.TEST]: 'Codify test',
  [ProcessName.APPLY]: 'Codify apply',
  [ProcessName.PLAN]: 'Codify plan',
  [ProcessName.DESTROY]: 'Codify destroy',
  [ProcessName.REFRESH]: 'Codify refresh',
  [ProcessName.IMPORT]: 'Codify import',
  [ProcessName.INIT]: 'Codify init',
  [ProcessName.TERMINATE]: 'Attempting to terminate existing instance',
  [SubProcessName.APPLYING_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Refresh states and generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.CREATE_ROOT_FILE]: 'Creating root codify file',
  [SubProcessName.VALIDATE]: 'Validating configs',
  [SubProcessName.GET_REQUIRED_PARAMETERS]: 'Getting required parameters',
  [SubProcessName.IMPORT_RESOURCE]: 'Importing resource',
  [SubProcessName.TEST_INITIALIZE_AND_VALIDATE]: 'Initializing and validating your configs',
  [SubProcessName.TEST_CHECKING_VM_INSTALLED]: 'Checking if VM is installed',
  [SubProcessName.TEST_STARTING_VM]: 'Starting VM',
  [SubProcessName.TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL]: 'Copying over configs and opening terminal (if a confirmation dialog appears within the VM, please confirm it.)',
  [SubProcessName.TEST_USER_CONTINUE_ON_VM]: 'Done setup! Please continue on the VM UI',
  [SubProcessName.TEST_DELETING_VM]: 'Deleting VM',
}

export class DefaultReporter implements Reporter {
  private renderEmitter = new EventEmitter();
  private progressState: ProgressState | null = null
  private verbosityToggleCallback: (() => void) | null = null;
  private sudoPasswordSubmittedCallback: ((password: string) => void) | null = null;
  silent = false;

  constructor() {
    render(<DefaultComponent emitter={this.renderEmitter}/>);

    ctx.on(Event.OUTPUT, (args) => this.log(args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, additionalName) => this.onSubprocessStartEvent(name, additionalName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, additionalName) => this.onSubprocessFinishEvent(name, additionalName));

    this.renderEmitter.on(RenderEvent.TOGGLE_VERBOSITY, () => {
      this.verbosityToggleCallback?.();
    });

    this.renderEmitter.on(RenderEvent.SUDO_PASSWORD_SUBMITTED, (password: string) => {
      this.sudoPasswordSubmittedCallback?.(password);
    });
  }

  onVerbosityToggle(callback: () => void): void {
    this.verbosityToggleCallback = callback;
  }

  onSudoPasswordSubmitted(callback: (password: string) => void): void {
    this.sudoPasswordSubmittedCallback = callback;
  }

  notifySudoPasswordResult(success: boolean): void {
    this.renderEmitter.emit(RenderEvent.SUDO_PASSWORD_RESULT, { success });
  }

  notifySudoPasswordPreSupplied(): void {
    setImmediate(() => this.renderEmitter.emit(RenderEvent.SUDO_PASSWORD_PRE_SUPPLIED));
  }

  async promptPressKeyToContinue(message?: string): Promise<void> {
    const previousRenderState = this.getRenderState();

    await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.PROMPT_PRESS_KEY_TO_CONTINUE, message),
      RenderEvent.PROMPT_RESULT,
    )

    this.updateRenderState(previousRenderState.status, previousRenderState.data);
  }

  async displayInitBanner(): Promise<void> {
    await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.DISPLAY_INIT_BANNER),
      RenderEvent.PROMPT_RESULT,
    )
  }

  async promptInput(prompt: string, error?: string, placeholder?: string): Promise<string> {
    return this.updateStateAndAwaitEvent<string>(
      () => this.updateRenderState(RenderStatus.PROMPT_INPUT, { prompt, error, placeholder }),
      RenderEvent.PROMPT_RESULT,
    )
  }

  async displayProgress(): Promise<void> {
    this.updateRenderState(RenderStatus.PROGRESS);
  }

  async hide(): Promise<void> {
    this.updateRenderState(RenderStatus.NOTHING);
  }

  async displayImportWarning(requiresParameters: string[], noParametersRequired: string[]): Promise<void> {
    await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.IMPORT_PROMPT_WARNING, { requiresParameters, noParametersRequired }),
      RenderEvent.PROMPT_RESULT
    )
  }

  async promptUserForValues(resources: Array<ResourceInfo>, promptType: PromptType): Promise<ResourceConfig[]> {
    if (resources.length === 0) {
      return [];
    }

    fullscreen()
    process.on('beforeExit', exitFullScreen);

    let props;
    switch (promptType) {
      case PromptType.IMPORT: {
        props = {
          title: 'Multiple instances exist: identify which instance to import',
          description: 'fill out required',
        }
        break;
      }

      case PromptType.DESTROY: {
        props = {
          title: 'Multiple instances exist: identify which instance to destroy',
          description: 'fill out required',
        }
        break;
      }
    }

    const formProps: FormProps = {
      form: {
        ...props,
        sections: resources.map((info) => ({
          title: info.type,
          description: info.description,
          fields: info.getRequiredParameters().map((parameter) => ({
            type: parameter.type,
            name: parameter.name,
            label: parameter.name,
            initialValue: parameter.value,
            description: parameter.description,
            required: true,
          })),
        })),
      },
    }
    
    const userInput = await this.updateStateAndAwaitEvent<FormReturnValue>(() =>
      this.updateRenderState(RenderStatus.IMPORT_PROMPT, formProps),
      RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT
    );

    exitFullScreen()
    process.off('beforeExit', exitFullScreen);

    this.updateRenderState(RenderStatus.PROGRESS);

    return userInput.map((v) => ResourceConfig.fromJson({
      core: { type: v.section.title },
      parameters: v.value,
    }))

    function fullscreen() {
      process.stdout.write('\u001B[?1049h');
      process.stdout.write('\u001B[?1000h');
    }

    function exitFullScreen() {
      process.stdout.write('\u001B[?1049l');
      process.stdout.write('\u001B[?1000l');
    }
  }

  displayImportResult(importResult: ImportResult, showConfigs: boolean): void {
    store.set(store.progressState, null);
    this.progressState = null;

    this.updateRenderState(RenderStatus.DISPLAY_IMPORT_RESULT, { importResult, showConfigs });
  }

  async promptSudo(pluginName: string, data: CommandRequestData, secureMode: boolean): Promise<string | undefined> {
    ctx.log(chalk.blue(`Plugin: "${pluginName}" requires root access to run command: "sudo ${data.command}"`));

    let password;

    // Password is only needed outside of sudo timeout. Pass password in as undefined if not needed.
    if (secureMode || !SudoUtils.validate()) {
      password = await this.getUserPassword();
    }

    return password;
  }

  displayPlan(plan: Plan): void {
    this.updateRenderState(RenderStatus.DISPLAY_PLAN, plan)
  }

  displayMessage(message: string) {
    this.updateRenderState(RenderStatus.DISPLAY_MESSAGE, message);
  }

  async promptInitResultSelection(availableTypes: string[]): Promise<string[]> {
    return this.updateStateAndAwaitEvent(
      () => this.updateRenderState(RenderStatus.PROMPT_INIT_RESULT_SELECTION, availableTypes),
      RenderEvent.PROMPT_RESULT,
    )
  }

  async promptConfirmation(message: string): Promise<boolean> {
    const result = await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.PROMPT_CONFIRMATION, message),
      RenderEvent.PROMPT_RESULT
    )

    this.log(result ? `${message} -> "Yes"` : `${message} -> "No"`)

    // This was added because there was a very hard to debug memory bug with Yoga (ink.js layout engine). Could not
    // identify the root cause of the problem but this alleviates it.
    await sleep(50)
    this.updateRenderState(RenderStatus.NOTHING, null);
    await sleep(50);

    return result;
  }

  async promptOptions(message:string, options:string[]): Promise<number> {
    const prevRenderState = this.getRenderState();

    const result = await this.updateStateAndAwaitEvent<string>(
      () => this.updateRenderState(RenderStatus.PROMPT_OPTIONS, { message, options }),
      RenderEvent.PROMPT_RESULT
    )

    this.log(`${message} -> "${result}"`)

    // This was added because there was a very hard to debug memory bug with Yoga (ink.js layout engine). Could not
    // identify the root cause of the problem but this alleviates it.
    await sleep(50)
    this.updateRenderState(prevRenderState.status, prevRenderState.data);
    await sleep(50);

    return options.indexOf(result);
  }

  displayFileModifications(diff: Array<{ file: string; modification: FileModificationResult}>) {
    this.updateRenderState(RenderStatus.DISPLAY_FILE_MODIFICATION, diff);
  }

  private log(args: string): void {
    if (this.silent) return;

    this.renderEmitter.emit(RenderEvent.LOG, args);
  }

  private onProcessStartEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState = {
      label: label + '...',
      name,
      status: ProgressStatus.IN_PROGRESS,
      subProgresses: [],
    };

    this.log(`${label} started`)
    store.set(store.progressState, this.progressState);
  }

  private onProcessFinishEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];
    this.log(`${label} finished successfully`)

    this.progressState!.status = ProgressStatus.FINISHED;
    store.set(store.progressState, structuredClone(this.progressState));
  }

  private onSubprocessStartEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName ? ' ' + additionalName : '');
    this.log(`${label} started`)

    this.progressState?.subProgresses?.push({
      label,
      name: name + (additionalName ?? ''),
      status: ProgressStatus.IN_PROGRESS,
    });
    store.set(store.progressState, structuredClone(this.progressState));
  }

  private onSubprocessFinishEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName ? ' ' + additionalName : '');

    const subProgress = this.progressState
      ?.subProgresses
      ?.find((p) => p.name === name + (additionalName ?? ''));

    if (!subProgress) {
      return;
    }

    subProgress.status = ProgressStatus.FINISHED;

    this.log(`${label} finished successfully`)
    store.set(store.progressState, structuredClone(this.progressState));
  }

  private async getUserPassword(): Promise<string> {
    let attemptCount = 0;

    while (attemptCount < 3) {
      this.renderEmitter.emit(RenderEvent.DISABLE_SUDO_PROMPT, false);
      const passwordAttempt = await this.updateStateAndAwaitEvent<string>(
        () => this.updateRenderState(RenderStatus.SUDO_PROMPT, attemptCount),
        RenderEvent.SUDO_PROMPT_RESULT,
      );
      this.renderEmitter.emit(RenderEvent.DISABLE_SUDO_PROMPT, true);

      // Validates that the password works
      if (SudoUtils.validate(passwordAttempt)) {
        await this.displayProgress();
        return passwordAttempt;
      }

      if (attemptCount + 1 < 3) {
        ctx.log('Password:')
        ctx.log(chalk.red(`Sorry, try again. (${attemptCount + 1}/3)`))
      }

      attemptCount++;
    }

    this.updateRenderState(null)
    store.set(store.renderState, { status: null });
    throw new Error('sudo: 3 incorrect password attempts')
  }

  private getRenderState(): { status: RenderStatus, data: any } {
    return store.get(store.renderState) as { status: RenderStatus, data: any };
  }

  private updateRenderState(status: RenderStatus | null, data?: unknown): void {
    store.set(store.renderState, { status, data });
  }

  // This is needed if we await any prompts. It makes the UI feel a lot more fluid since the await is no longer blocking
  private async updateStateAndAwaitEvent<T>(fn: () => void, eventName: string): Promise<T> {
    return (await Promise.all([
      fn(),
      this.awaitEvent(eventName)
    ])).at(1) as T;
  }

  private awaitEvent<T>(name: string): Promise<T> {
    return new Promise((resolve) => {
      this.renderEmitter.once(name, resolve)
    });
  }
}

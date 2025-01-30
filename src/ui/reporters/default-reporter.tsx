import chalk from 'chalk';
import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { Plan } from '../../entities/plan.js';
import { Event, ProcessName, SubProcessName, ctx } from '../../events/context.js';
import { ImportResult, RequiredParameters, UserSuppliedParameters } from '../../orchestrators/import.js';
import { sleep } from '../../utils/index.js';
import { SudoUtils } from '../../utils/sudo.js';
import { DefaultComponent } from '../components/default-component.js';
import { ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { RenderStatus, store } from '../store/index.js';
import { RenderEvent, Reporter } from './reporter.js';

const ProgressLabelMapping = {
  [ProcessName.APPLY]: 'Codify apply',
  [ProcessName.PLAN]: 'Codify plan',
  [ProcessName.DESTROY]: 'Codify destroy',
  [ProcessName.IMPORT]: 'Codify import',
  [SubProcessName.APPLYING_RESOURCE]: 'Applying resource',
  [SubProcessName.GENERATE_PLAN]: 'Refresh states and generating plan',
  [SubProcessName.INITIALIZE_PLUGINS]: 'Initializing plugins',
  [SubProcessName.PARSE]: 'Parsing configs',
  [SubProcessName.CREATE_ROOT_FILE]: 'Creating root codify file',
  [SubProcessName.VALIDATE]: 'Validating configs',
  [SubProcessName.GET_REQUIRED_PARAMETERS]: 'Getting required parameters',
  [SubProcessName.IMPORT_RESOURCE]: 'Importing resource'
}

export class DefaultReporter implements Reporter {

  private renderEmitter = new EventEmitter();
  private progressState: ProgressState | null = null

  constructor() {
    render(<DefaultComponent emitter={this.renderEmitter}/>);

    ctx.on(Event.OUTPUT, (args) => this.log(args));
    ctx.on(Event.PROCESS_START, (name) => this.onProcessStartEvent(name))
    ctx.on(Event.PROCESS_FINISH, (name) => this.onProcessFinishEvent(name))
    ctx.on(Event.SUB_PROCESS_START, (name, additionalName) => this.onSubprocessStartEvent(name, additionalName));
    ctx.on(Event.SUB_PROCESS_FINISH, (name, additionalName) => this.onSubprocessFinishEvent(name, additionalName))
  }

  async promptUserForParameterValues(requiredParameters: RequiredParameters): Promise<UserSuppliedParameters> {
    if (requiredParameters.size === 0) {
      return new Map();
    }

    fullscreen()
    process.on('beforeExit', exitFullScreen);

    const userInput = await this.updateStateAndAwaitEvent<object>(() => {
      this.updateRenderState(RenderStatus.IMPORT_PROMPT, requiredParameters);
    }, RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT);


    exitFullScreen()
    process.off('beforeExit', exitFullScreen);
    this.updateRenderState(RenderStatus.PROGRESS);

    return this.extractUserSuppliedParametersFromResult(userInput);

    function fullscreen() {
      process.stdout.write('\x1b[?1049h');
      process.stdout.write('\x1b[?1000h');
    }

    function exitFullScreen() {
      process.stdout.write('\x1b[?1049l');
      process.stdout.write('\x1b[?1000l');
    }
  }

  displayImportResult(importResult: ImportResult): void {
    this.updateRenderState(RenderStatus.DISPLAY_IMPORT_RESULT, importResult);
  }

  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    console.log(chalk.blue(`Plugin: "${pluginName}" requires root access to run command: "${data.command}"`));

    let password;

    // Password is only needed outside of sudo timeout. Pass password in as undefined if not needed.
    if (secureMode || !SudoUtils.validate()) {
      password = await this.getUserPassword();
    }

    return SudoUtils.runCommand(data.command, data.options, secureMode, pluginName, password)
  }

  displayPlan(plan: Plan): void {
    this.updateRenderState(RenderStatus.DISPLAY_PLAN, plan)
    store.set(store.progressState, null);
    this.progressState = null;
  }

  async promptConfirmation(message: string): Promise<boolean> {
    const continueApply = await this.updateStateAndAwaitEvent<boolean>(
      () => this.updateRenderState(RenderStatus.PROMPT_CONFIRMATION, message),
      RenderEvent.PROMPT_CONFIRMATION_RESULT
    )

    if (continueApply) {
      this.updateRenderState(RenderStatus.PROGRESS)
      this.log(`${message} -> "Yes"`)
    }

    return continueApply;
  }

  async displayApplyComplete(messages: string[]): Promise<void> {
    this.updateRenderState(RenderStatus.APPLY_COMPLETE, messages);
    await sleep(100); // This gives the renderer enough time to complete before the prompt exits
  }

  private log(args: string): void {
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
      name: name + additionalName,
      status: ProgressStatus.IN_PROGRESS,
    });
    store.set(store.progressState, structuredClone(this.progressState));
  }

  private onSubprocessFinishEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName ? ' ' + additionalName : '');

    const subProgress = this.progressState
      ?.subProgresses
      ?.find((p) => p.name === name + additionalName);

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
        this.updateRenderState(RenderStatus.PROGRESS)
        return passwordAttempt;
      }

      if (attemptCount + 1 < 3) {
        console.log('Password:')
        console.error(chalk.red(`Sorry, try again. (${attemptCount + 1}/3)`))
      }

      attemptCount++;
    }

    this.updateRenderState(null)
    store.set(store.renderState, { status: null });
    throw new Error('sudo: 3 incorrect password attempts')
  }

  private extractUserSuppliedParametersFromResult(result: object): Map<string, Record<string, unknown>> {
    const resources = Object.entries(result)
      .map(([key, value]) => {
        const [resourceName, parameterName] = key.split('.');
        return [resourceName, parameterName, value] as const;
      })
      .reduce((result, parameter) => {
        const [resourceName, parameterName, value] = parameter

        if (!result[resourceName]) {
          result[resourceName] = {}
        }

        result[resourceName][parameterName] = value

        return result;
      }, {} as Record<string, Record<string, unknown>>)

    return new Map(Object.entries(resources));
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

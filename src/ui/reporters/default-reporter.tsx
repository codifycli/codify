import chalk from 'chalk';
import { SudoRequestData , SudoRequestResponseData } from 'codify-schemas';
import { render } from 'ink';
import { EventEmitter } from 'node:events';
import React from 'react';

import { Plan } from '../../entities/plan.js';
import { Event, ProcessName, SubProcessName, ctx } from '../../events/context.js';
import { ImportResult, RequiredParameters, UserSuppliedParameters } from '../../orchestrators/import.js';
import { SudoUtils } from '../../utils/sudo.js';
import { DefaultComponent } from '../components/default-component.js';
import { ProgressState, ProgressStatus } from '../components/progress/progress-display.js';
import { RenderStatus, store } from '../store/index.js';
import { DisplayPlanStateTransition, RenderEvent, RenderState, Reporter } from './reporter.js';

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

  async askRequiredParametersForImport(requiredParameters: RequiredParameters): Promise<UserSuppliedParameters> {
    if (requiredParameters.size === 0) {
      return new Map();
    }

    this.renderEmitter.emit(RenderEvent.PROMPT_IMPORT_PARAMETERS, requiredParameters);

    return new Promise((resolve) => {
      this.renderEmitter.once(RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT, (result: object) => {
        const userSuppliedParameters = this.extractUserSuppliedParametersFromResult(result);
        resolve(userSuppliedParameters);
      });
    })
  }

  displayImportResult(importResult: ImportResult): void {
    this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
      nextState: RenderState.DISPLAY_IMPORT_RESULT,
      importResult,
    })
  }

  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    console.log(chalk.blue(`Plugin: "${pluginName}" requires root access to run command: "${data.command}"`));

    let password;

    // Password is only needed outside of sudo timeout. Pass password in as undefined if not needed.
    if (secureMode || !SudoUtils.validate()) {
      password = await this.getUserPassword();
    }

    const result = await SudoUtils.runCommand(data.command, data.options, secureMode, pluginName, password)
    this.renderEmitter.emit(RenderEvent.PROMPT_SUDO_GRANTED);

    return result;
  }

  displayPlan(plan: Plan): void {
    store.set(store.renderState, { status: RenderStatus.DISPLAY_PLAN, data: plan });
    store.set(store.progressState, null);
    this.progressState = null;

    // this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
    //   nextState: RenderState.DISPLAY_PLAN,
    //   plan,
    // } as DisplayPlanStateTransition);
  }

  async promptConfirmation(message: string): Promise<boolean> {
    const result = await Promise.all([
      new Promise<boolean>((resolve) => {
        this.renderEmitter.once(RenderEvent.PROMPT_CONFIRMATION_RESULT, (isConfirmed) => resolve(isConfirmed as boolean));
      }),

      store.set(store.renderState, { status: RenderStatus.PROMPT_CONFIRMATION, data: message })
      // this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
      //   nextState: RenderState.PROMPT_CONFIRMATION,
      //   message,
      // }),
    ])

    const continueApply = result[0];

    if (continueApply) {
      // this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
      //   nextState: RenderState.APPLYING,
      // });

      store.set(store.renderState, { status: RenderStatus.PROGRESS });

      this.log(`${message} -> "Yes"`)
    }

    return continueApply;
  }

  displayApplyComplete(messages: string[]): Promise<void> | void {
    store.set(store.renderState, { status: RenderStatus.APPLY_COMPLETE });

    // this.renderEmitter.emit(RenderEvent.STATE_TRANSITION, {
    //   nextState: RenderState.APPLY_COMPLETE,
    // });
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

    store.set(store.progressState, structuredClone(this.progressState));
    // this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private onProcessFinishEvent(name: ProcessName): void {
    const label = ProgressLabelMapping[name];

    this.progressState!.status = ProgressStatus.FINISHED;

    this.log(`${label} finished successfully`)

    store.internal.set(store.progressState, structuredClone(this.progressState));
    // this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private onSubprocessStartEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    this.progressState?.subProgresses?.push({
      label,
      name: name + additionalName,
      status: ProgressStatus.IN_PROGRESS,
    });

    this.log(`${label} started`)

    store.set(store.progressState, structuredClone(this.progressState));
    // this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private onSubprocessFinishEvent(name: SubProcessName, additionalName?: string): void {
    const label = ProgressLabelMapping[name] + (additionalName
        ? ' ' + additionalName
        : ''
    );

    const subProgress = this.progressState
      ?.subProgresses
      ?.find((p) => p.name === name + additionalName);

    if (!subProgress) {
      return;
    }

    subProgress.status = ProgressStatus.FINISHED;

    this.log(`${label} finished successfully`)
    store.set(store.progressState, structuredClone(this.progressState));
    // this.renderEmitter.emit(RenderEvent.PROGRESS_UPDATE, this.progressState);
  }

  private async getUserPassword(): Promise<string> {
    let attemptCount = 0;

    while (attemptCount < 3) {
      const passwordAttempt = await this.renderSudoPrompt(attemptCount);

      // Validates that the password works
      if (SudoUtils.validate(passwordAttempt)) {
        this.renderEmitter.emit(RenderEvent.PROMPT_SUDO_GRANTED);
        return passwordAttempt
      }

      if (attemptCount + 1 < 3) {
        console.log('Password:')
        console.error(chalk.red(`Sorry, try again. (${attemptCount + 1}/3)`))
      }

      attemptCount++;
    }

    this.renderEmitter.emit(RenderEvent.PROMPT_SUDO_ERROR);
    throw new Error('sudo: 3 incorrect password attempts')
  }

  private async renderSudoPrompt(attemptCount: number): Promise<string> {
    return new Promise((resolve) => {
      this.renderEmitter.emit(RenderEvent.PROMPT_SUDO, attemptCount);
      this.renderEmitter.on(RenderEvent.PROMPT_SUDO_RESULT, (password) => {
        resolve(password)
      })
    })
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
}

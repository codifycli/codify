import chalk from 'chalk';
import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import { Box, Static, Text, render as inkRender } from 'ink';
import React from 'react';

import { Plan } from '../../entities/plan.js';
import { Event, ProcessName, SubProcessName, ctx } from '../../events/context.js';
import {
  ImportResult,
  RequiredParameters,
  UserSuppliedParameters,
  UserSuppliedProperties
} from '../../orchestrators/import.js';
import { ProgressDisplay, ProgressState } from '../components/progress/ProgressDisplay.js';
import { DisplayPlanStateTransition, RenderEvent, Reporter } from './reporter.js';
import { PlanComponent } from '../components/plan/plan.js';
import { ImportParametersForm } from '../components/import/index.js';
import { ImportResultComponent } from '../components/import/import-result.js';
import { PasswordInput, Select } from '@inkjs/ui';
import EventEmitter from 'node:events';
import { CompletionSection } from '../components/sections/CompletionSection.js';
import { SudoUtils } from '../../utils/sudo.js';
import { DefaultComponent } from '../components/default-component.js';
import { DefaultReporterProgressSubscriber } from '../components/progress/progress-subscriber.js';
import spinner from '../components/progress/Spinner.js';

enum RenderState {
  PROGRESS,
  DISPLAY_PLAN,
  DISPLAY_IMPORT_RESULT,
  IMPORT_PROMPT,
  PROMPT_CONFIRMATION,
  APPLY_COMPLETE,
  SUDO_PROMPT,
}

enum Callbacks {
  CONFIRMATION_RESULT = 'confirmation_result',
  PROMPT_IMPORT_RESULT = 'prompt_import_result',
  SUDO_PROMPT_RESULT = 'sudo_prompt_result',
}

interface AppState {
  renderState?: RenderState;
  progressState?: ProgressState | null;
  plan?: Plan;
  data?: any; // Any temporary data we want to pass will be stored here. For ex: the apply confirmation message.
}

class DefaultReporter2 extends React.Component<{}, AppState> implements Reporter {
  private renderEmitter = new EventEmitter();
  private spinnerEmitter = new EventEmitter();
  private callbacks = new EventEmitter();

  state: AppState = {
    renderState: RenderState.PROGRESS,
  }

  componentDidMount() {
    ctx.on(Event.OUTPUT, (args) => this.log(args));
    const progress = new DefaultReporterProgressSubscriber()
    progress.onUpdate(this.onProgressUpdate.bind(this))
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
    this.setState(structuredClone({
      ...this.state,
      renderState: RenderState.DISPLAY_PLAN,
      plan: plan.filterNoopResources(),
    }))
  }

  async promptConfirmation(message: string): Promise<boolean> {
    this.setState(structuredClone({
      ...this.state,
      renderState: RenderState.PROMPT_CONFIRMATION,
      data: message,
    }));

    const continueApply = await this.awaitCallback<boolean>(Callbacks.CONFIRMATION_RESULT);
    if (continueApply) {
      this.setState({
        ...this.state,
        renderState: RenderState.PROGRESS,
      })
      this.log(`${message} -> "Yes"`)
    }

    return continueApply;
  }

  displayApplyComplete(messages: string[]): Promise<void> | void {
    this.setState(structuredClone({
      ...this.state,
      renderState: RenderState.APPLY_COMPLETE,
    }))
  }

  async askRequiredParametersForImport(requiredParameters: RequiredParameters): Promise<UserSuppliedParameters> {
    if (requiredParameters.size === 0) {
      return new Map();
    }

    this.setState({
      ...this.state,
      renderState: RenderState.IMPORT_PROMPT,
      data: requiredParameters,
    })

    const result = await this.awaitCallback<object>(Callbacks.PROMPT_IMPORT_RESULT);
    return this.extractUserSuppliedParametersFromResult(result);
  }

  displayImportResult(importResult: ImportResult): void {
    this.setState({
      ...this.state,
      renderState: RenderState.DISPLAY_IMPORT_RESULT,
      data: importResult,
    })
  }

  private onProgressUpdate(progressState: ProgressState | null, eventType: Event): void {
    this.setState({
      ...this.state,
      progressState,
    });

    // switch (eventType) {
    //   case Event.PROCESS_START: this.log(`${progressState?.label} started`); return;
    //   case Event.PROCESS_FINISH: this.log(`${progressState?.label} finished successfully`); return;
    //   case Event.SUB_PROCESS_START:
    // }
  }

  private log(log: string): void {
    console.log(chalk.cyan(log));
    this.spinnerEmitter.emit('data');
  }

  private async getUserPassword(): Promise<string> {
    let attemptCount = 0;

    while (attemptCount < 3) {
      this.setState({
        ...this.state,
        renderState: RenderState.SUDO_PROMPT,
        data: attemptCount,
      })

      const passwordAttempt = await this.awaitCallback<string>(Callbacks.SUDO_PROMPT_RESULT)

      // Validates that the password works
      if (SudoUtils.validate(passwordAttempt)) {
        this.setState({
          ...this.state,
          renderState: RenderState.PROGRESS,
        })

        return passwordAttempt;
      }

      if (attemptCount + 1 < 3) {
        console.log('Password:')
        console.error(chalk.red(`Sorry, try again. (${attemptCount + 1}/3)`))
      }

      attemptCount++;
    }

    this.setState({
      ...this.state,
      renderState: undefined,
    });

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

  private awaitCallback<T>(name: string): Promise<T> {
    return new Promise<T>((resolve) => this.callbacks.once(name, resolve))
  }

  render() {
    return <Box flexDirection="column">
      {
        this.state.renderState === RenderState.PROGRESS && this.state.progressState &&  (
          <ProgressDisplay emitter={this.spinnerEmitter} eventType="data" progress={this.state.progressState}/>
        )
      }
      {
        this.state.renderState === RenderState.DISPLAY_PLAN && <Static items={[this.state.plan]}>{
          (plan, idx) => <PlanComponent key={idx} plan={plan!}/>
        }</Static>
      }
      {
        this.state.renderState === RenderState.PROMPT_CONFIRMATION && (
          <Box flexDirection="column">
            <Text>{this.state.data}</Text>
            <Select onChange={(value) => this.callbacks.emit(Callbacks.CONFIRMATION_RESULT, value === 'yes')} options={[
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ]}/>
          </Box>
        )
      }
      {
        this.state.renderState === RenderState.APPLY_COMPLETE && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text>🎉 Finished applying 🎉</Text>
            <Text>Open a new terminal or source '.zshrc' for the new changes to be reflected</Text>
          </Box>
        )
      }
      {
        this.state.renderState === RenderState.SUDO_PROMPT && (
          <Box flexDirection="column">
            <Text>Password:</Text>
            {/* Use sudoAttemptCount as a hack to reset password input between attempts */}
            <PasswordInput key={this.state.data} onSubmit={(password) => {
              this.callbacks.emit(Callbacks.SUDO_PROMPT_RESULT, password);
            }}/>
          </Box>
        )
      }
      {
        this.state.renderState === RenderState.IMPORT_PROMPT && (
          <ImportParametersForm onSubmit={(result) => {
            this.callbacks.emit(Callbacks.PROMPT_IMPORT_RESULT, result)
          }} requiredParameters={this.state.data}/>
        )
      }
      {
        this.state.renderState === RenderState.DISPLAY_IMPORT_RESULT && (
          <Static items={[this.state.data]}>{
            (importResult, idx) => <ImportResultComponent importResult={importResult} key={idx}/>
          }</Static>
        )
      }
    </Box>
  }
}

export const DefaultReporterFactory = {
  createAndRender(): Reporter {
    const ref = React.createRef<DefaultReporter2>()
    const element = <DefaultReporter2 ref={ref}/>

    inkRender(element);
    return ref.current!;
  },
};

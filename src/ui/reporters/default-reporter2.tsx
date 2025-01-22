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
import { ProgressDisplay  } from '../components/progress/ProgressDisplay.js';
import { DisplayPlanStateTransition, RenderEvent, Reporter } from './reporter.js';
import { PlanComponent } from '../components/plan/plan.js';
import { ImportParametersForm } from '../components/import/index.js';
import { ImportResultComponent } from '../components/import/import-result.js';
import { PasswordInput, Select } from '@inkjs/ui';
import EventEmitter from 'node:events';
import { CompletionSection } from '../components/sections/CompletionSection.js';
import { SudoUtils } from '../../utils/sudo.js';
import { DefaultComponent } from '../components/default-component.js';

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
}

interface AppState {
  renderState: RenderState;
  plan?: Plan;
  data?: any; // Any temporary data we want to pass will be stored here. For ex: the apply confirmation message.
}

class DefaultReporter2 extends React.Component<{}, AppState> implements Reporter {
  private renderEmitter = new EventEmitter();
  private callbacks = new EventEmitter();

  state: AppState = {
    renderState: RenderState.PROGRESS,
  }

  componentDidMount() {
    ctx.on(Event.OUTPUT, (args) => this.log(args));
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
    this.setState(structuredClone({
      ...this.state,
      renderState: RenderState.DISPLAY_IMPORT_RESULT,
      importResult,
    }))
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
      this.setState(structuredClone({
        renderState: RenderState.PROGRESS,
      }))
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

  private log(log: string): void {
    console.log(chalk.cyan(log));
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

  private awaitCallback<T>(name: string): Promise<T> {
    return new Promise<T>((resolve) => this.callbacks.once(name, resolve))
  }

  render() {
    return <Box flexDirection="column">
      {
        this.state.renderState === RenderState.PROGRESS && (
          <ProgressDisplay/>
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
            <Select onChange={(value) => this.callbacks.emit(RenderEvent.PROMPT_CONFIRMATION_RESULT, value === 'yes')} options={[
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
            <PasswordInput key={sudoAttemptCount} onSubmit={(password) => {
              this.callbacks.emit(RenderEvent.PROMPT_SUDO_RESULT, password);
            }}/>
          </Box>
        )
      }
      {
        this.state.renderState === RenderState.IMPORT_PROMPT && (
          <ImportParametersForm onSubmit={(result) => {
            this.callbacks.emit(RenderEvent.PROMPT_IMPORT_PARAMETERS_RESULT, result)
          }} requiredParameters={requiredParametersForImport}/>
        )
      }
      {
        this.state.renderState === RenderState.DISPLAY_IMPORT_RESULT && (
          <Static items={[this.state.importResult]}>{
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

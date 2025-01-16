import chalk from 'chalk';
import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import readline from 'node:readline';

import { Plan } from '../../entities/plan.js';
import { Event, ctx } from '../../events/context.js';
import { ImportResult, RequiredParameters, UserSuppliedParameters } from '../../orchestrators/import.js';
import { SudoUtils } from '../../utils/sudo.js';
import { prettyFormatPlan } from '../plan-pretty-printer.js';
import { Reporter } from './reporter.js';

export class PlainReporter implements Reporter {
  private readonly rl = readline.createInterface(process.stdin, process.stdout);

  constructor() {
    ctx.on(Event.OUTPUT, (...args) => console.log(...args))
    ctx.on(Event.PROCESS_START, (name) => console.log(name))
    ctx.on(Event.PROCESS_FINISH, (name) => console.log(name))
    ctx.on(Event.SUB_PROCESS_START, (name) => console.log(name))
    ctx.on(Event.SUB_PROCESS_FINISH, (name) => console.log(name))
  }

  async askRequiredParametersForImport(
    requiredParameters: RequiredParameters
  ): Promise<UserSuppliedParameters> {
    if (requiredParameters.size > 0 || [...requiredParameters.values()].reduce(
      (total, arr) => arr.length + total, 0
    )) {
      console.log('Some required information is needed for the import');
    }

    const parameterInput = new Map<string, Record<string, unknown>>();

    for (const [type, requiredParameter] of requiredParameters.entries()) {
      if (requiredParameter.length > 0) {
        console.log(`Resource: "${type}" requires additional information:`)
      }

      for (const parameter of requiredParameter) {
        const response = await new Promise((resolve) => {
          this.rl.question(`${parameter.parameterName} [${parameter.parameterType}]: `, (answer) => resolve(answer));
        });

        if (!parameterInput.has(type)) {
          parameterInput.set(type, {});
        }

        parameterInput.get(type)![parameter.parameterName] = response;
      }
    }

    return parameterInput;
  }

  displayImportResult(importResult: ImportResult) {
    console.log();
    console.log(JSON.stringify(importResult.result, null, 2));

    if (importResult.errors.length > 0) {
      console.log('The following configs failed to import:')
      console.log(JSON.stringify(importResult.errors, null, 2));
    }
  }

  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    console.log(chalk.blue(`Plugin: "${pluginName}" requires root access to run command: "${data.command}"`));
    return SudoUtils.runCommand(data.command, data.options, secureMode, pluginName);
  }

  async promptConfirmation(message: string): Promise<boolean> {
    const response = await new Promise((resolve) => {
      this.rl.question(`${message} (only 'yes' is accepted)`, (answer) => resolve(answer));
    });

    return response === 'yes';
  }

  displayPlan(plan: Plan): void {
    console.log(
      prettyFormatPlan(plan.filterNoopResources())
    );
  }

  displayApplyComplete(message: string[]): void {
    console.log('🎉 Finished applying 🎉');
    console.log('Open a new terminal or source \'.zshrc\' for the new changes to be reflected')
  }

}

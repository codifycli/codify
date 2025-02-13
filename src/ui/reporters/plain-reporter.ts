import chalk from 'chalk';
import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import readline from 'node:readline';

import { Plan } from '../../entities/plan.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { Event, ctx } from '../../events/context.js';
import { ImportResult } from '../../orchestrators/import.js';
import { FileModificationResult } from '../../utils/file-modification-calculator.js';
import { SudoUtils } from '../../utils/sudo.js';
import { prettyFormatPlan } from '../plan-pretty-printer.js';
import { PromptType, Reporter } from './reporter.js';

export class PlainReporter implements Reporter {
  private readonly rl = readline.createInterface(process.stdin, process.stdout);

  constructor(attachListeners = true) {
    if (attachListeners) {
      ctx.on(Event.OUTPUT, (...args) => console.log(...args))
      ctx.on(Event.PROCESS_START, (name) => console.log(name))
      ctx.on(Event.PROCESS_FINISH, (name) => console.log(name))
      ctx.on(Event.SUB_PROCESS_START, (name) => console.log(name))
      ctx.on(Event.SUB_PROCESS_FINISH, (name) => console.log(name))
    }
  }

  async promptOptions(message: string, options: string[]): Promise<number> {
    console.log(message);
    console.log('')

    const response = await new Promise((resolve) => {
      this.rl.question(`${options.map((o, idx) => `[${idx}] ${o} ` ).join(' ')}\n`, (answer) => resolve(answer));
    });

    const parsedNumber = Number.parseInt(response as string, 10);
    if (!Number.isInteger(parsedNumber) || parsedNumber < 0 || parsedNumber > options.length - 1) {
      throw new Error(`Invalid response ${response}`)
    }

    return Number.parseInt(response as string, 10);
  }

  displayFileModifications(diffs: { file: string; modification: FileModificationResult; }[]): void {
    console.log(chalk.bold('File modifications\n'))

    for (const diff of diffs) {
      console.log(chalk.bold(diff.file))
      console.log('')
      console.log(diff.modification.diff)
      console.log('')
    }
  }

  displayMessage(message: string): void {
    console.log(message);
  }

  async promptUserForValues(
    resourceInfoList: ResourceInfo[],
    promptType: PromptType
  ): Promise<ResourceConfig[]> {
    const requiredParameters = resourceInfoList.flatMap((r) => r.getRequiredParameters())
    if (requiredParameters.length > 0) {
      console.log('Some required information is needed for the import');
    }

    const result: ResourceConfig[] = [];
    for (const resourceInfo of resourceInfoList) {
      if (resourceInfo.getRequiredParameters().length > 0) {
        console.log(`Resource: "${resourceInfo.type}" requires additional information:`)
      }

      const requiredParameter = resourceInfo.getRequiredParameters()
      const configJson: Record<string, unknown> = { type: resourceInfo.type }
      for (const parameter of requiredParameter) {
        const response = await new Promise((resolve) => {
          this.rl.question(`${parameter.name} [${parameter.type}]: `, (answer) => resolve(answer));
        });

        configJson[parameter.name] = response;
      }

      result.push(new ResourceConfig(configJson as any))
    }

    return result;
  }

  displayImportResult(importResult: ImportResult) {
    console.log();
    console.log(JSON.stringify(importResult.result.map((r) => r.raw), null, 2));

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

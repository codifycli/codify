import chalk from 'chalk';
import { CommandRequestData } from '@codifycli/schemas';
import readline from 'node:readline';

import { Plan } from '../../entities/plan.js';
import { PluginError } from '../../common/errors.js';
import { formatApplyValidationError } from '../plugin-error-formatter.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ResourceInfo } from '../../entities/resource-info.js';
import { Event, ctx } from '../../events/context.js';
import { FileModificationResult } from '../../generators/index.js';
import { ImportResult } from '../../orchestrators/import.js';
import { prettyFormatPlan } from '../plan-pretty-printer.js';
import { PromptType, Reporter } from './reporter.js';

export class PlainReporter implements Reporter {
  private readonly rl = readline.createInterface(process.stdin, process.stdout);
  silent = false;
  
  constructor(attachListeners = true) {
    if (attachListeners) {
      ctx.on(Event.OUTPUT, (args) => !this.silent && process.stdout.write(args))
      ctx.on(Event.PROCESS_START, (name) => !this.silent && console.log(name))
      ctx.on(Event.PROCESS_FINISH, (name) => !this.silent && console.log(name))
      ctx.on(Event.SUB_PROCESS_START, (name) => !this.silent && console.log(name))
      ctx.on(Event.SUB_PROCESS_FINISH, (name) => !this.silent && console.log(name))
    }
  }

  promptPressKeyToContinue(message?: string | undefined): Promise<void> {
    ctx.log(message);
    ctx.log(chalk.dim.gray('<press any key to continue>'))
    process.stdin.setRawMode(true)
    return new Promise((resolve) => {
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false)
        resolve()
      })
    })
  }

  async hide(): Promise<void> {}

  async setRawMode(): Promise<void> {
    process.stdin.setRawMode(true);
  }

  async disableRawMode(): Promise<void> {
    process.stdin.setRawMode(false);
  }

  async displayImportWarning(): Promise<void> {
    ctx.log(chalk.bold('Additional information is required to continue import'))
    ctx.log('Some of the resources specified in the import support multiple instances. Additional information is required to identify the specific instance to import. If importing multiple instances is desired (for ex: multiple git clones) additional imports can be added in the prompt.')
  }

  async promptOptions(message: string, options: string[]): Promise<number> {
    ctx.log(message);
    ctx.log('')

    const response = await new Promise((resolve) => {
      this.rl.question(`${options.map((o, idx) => `[${idx}] ${o} ` ).join(' ')}\n`, (answer) => resolve(answer));
    });

    const parsedNumber = Number.parseInt(response as string, 10);
    if (!Number.isInteger(parsedNumber) || parsedNumber < 0 || parsedNumber > options.length - 1) {
      throw new Error(`Invalid response ${response}`)
    }

    return Number.parseInt(response as string, 10);
  }

  async displayFileModifications(diffs: { file: string; modification: FileModificationResult; }[]): Promise<void> {
    ctx.log(chalk.bold('File modifications\n'))

    for (const diff of diffs) {
      ctx.log(chalk.bold(diff.file))
      ctx.log('')
      ctx.log(diff.modification.diff)
      ctx.log('')
    }
  }

  async displayMessage(message: string): Promise<void> {
    ctx.log(message);
  }

  async promptUserForValues(
    resourceInfoList: ResourceInfo[],
    promptType: PromptType
  ): Promise<ResourceConfig[]> {
    const requiredParameters = resourceInfoList.flatMap((r) => r.getRequiredParameters())
    if (requiredParameters.length > 0) {
      ctx.log('Some required information is needed for the import');
    }

    const result: ResourceConfig[] = [];
    for (const resourceInfo of resourceInfoList) {
      if (resourceInfo.getRequiredParameters().length > 0) {
        ctx.log(`Resource: "${resourceInfo.type}" requires additional information:`)
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

  async displayProgress(): Promise<void> {}

  async promptInput(prompt: string, error?: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt + (error ? chalk.red(`\n${error} `) : ''), (answer) => resolve(answer));
    });
  }

  async promptInitResultSelection(availableTypes: string[]): Promise<string[]> {
    return availableTypes;
  }

  async displayImportResult(importResult: ImportResult): Promise<void> {
    ctx.log();
    ctx.log(JSON.stringify(importResult.result.map((r) => r.raw), null, 2));

    if (importResult.errors.length > 0) {
      ctx.log('The following configs failed to import:')
      ctx.log(JSON.stringify(importResult.errors, null, 2));
    }
  }

  async promptSudo(pluginName: string, data: CommandRequestData): Promise<string | undefined> {
    ctx.log(chalk.blue(`Plugin: "${pluginName}" requires root access to run command: "${data.command}"`));
    return undefined;
  }

  async displayInitBanner(): Promise<void> {
    ctx.log(`Codify is a configuration-as-code tool that helps you setup and manage your system.
Use this init flow to get started quickly with Codify.
    `);

    await this.promptConfirmation('Codify will scan your system for any supported programs or settings and automatically generate configs for you.')
  }

  async promptConfirmation(message: string): Promise<boolean> {
    const response = await new Promise((resolve) => {
      this.rl.question(`${message} (only 'yes' is accepted)`, (answer) => resolve(answer));
    });

    return response === 'yes';
  }

  async displayPlan(plan: Plan): Promise<void> {
    ctx.log(
      prettyFormatPlan(plan.filterNoopResources())
    );
  }

  async displayPluginError(errors: PluginError[]): Promise<void> {
    for (const error of errors) {
      if (error.errorData.errorType === 'apply_validation') {
        ctx.log(chalk.red(formatApplyValidationError(error)));
      } else {
        ctx.log(chalk.red(error.message));
      }
    }
  }

  displayApplyComplete(message: string[]): void {
    ctx.log('🎉 Finished applying 🎉');
    ctx.log('Open a new terminal or source \'.zshrc\' for the new changes to be reflected')
  }
}

import chalk from 'chalk';
import { PlanResponseData, SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import readline from 'node:readline';

import { ctx, Event } from '../../events/context.js';
import { SudoUtils } from '../../utils/sudo.js';
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

  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    console.log(chalk.blue(`Plugin: ${pluginName} requires root access to run command: '${data.command}'`));
    return SudoUtils.runCommand(data.command, data.options, secureMode, pluginName);
  }

  async promptApplyConfirmation(): Promise<boolean> {
    const response = await new Promise((resolve) => {
      this.rl.question('Is this okay?\n', (answer) => resolve(answer));
    });

    return response === 'yes';
  }

  displayPlan(plan: PlanResponseData[]): void {
    console.log(JSON.stringify(plan));
  }

}

import chalk from 'chalk';
import { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';
import createDebug, { Debugger } from 'debug';
import readline from 'node:readline';

import { Plan } from '../../entities/plan.js';
import { Event, ctx } from '../../events/context.js';
import { SudoUtils } from '../../utils/sudo.js';
import { Reporter } from './reporter.js';

const debug = createDebug('codify');

export class DebugReporter implements Reporter {
  private readonly rl = readline.createInterface(process.stdin, process.stdout);
  private debuggerCache = new Map<string, Debugger>();

  constructor() {
    ctx.on(Event.PLUGIN_STDOUT, (name, args) => this.getDebug(name)(args));
    ctx.on(Event.PLUGIN_STDERR, (name, args) => this.getDebug(name)(args));
    ctx.on(Event.STDOUT, (args) => debug(args));
    ctx.on(Event.STDERR, (args) => debug(args));
    ctx.on(Event.DEBUG, (args) => debug(args));
    ctx.on(Event.PROCESS_START, (name) => debug(name))
    ctx.on(Event.PROCESS_FINISH, (name) => debug(name))
    ctx.on(Event.SUB_PROCESS_START, (name) => debug(name))
    ctx.on(Event.SUB_PROCESS_FINISH, (name) => debug(name))
  }

  async promptSudo(pluginName: string, data: SudoRequestData, secureMode: boolean): Promise<SudoRequestResponseData> {
    console.log(chalk.blue(`Plugin: "${pluginName}" requires root access to run command: "${data.command}"`));
    return SudoUtils.runCommand(data.command, data.options, secureMode, pluginName);
  }

  async promptApplyConfirmation(): Promise<boolean> {
    const response = await new Promise((resolve) => {
      this.rl.question('Is this okay? (only \'yes\' is accepted)\n', (answer) => resolve(answer));
    });

    return response === 'yes';
  }

  displayPlan(plan: Plan): void {
    console.log(JSON.stringify(plan.raw, null, 2));
  }

  displayApplyComplete(message: string[]): void {
    console.log('🎉 Finished applying 🎉');
    console.log('Open a new terminal or source \'.zshrc\' for the new changes to be reflected')
  }

  private getDebug(name: string): Debugger {
    if (!this.debuggerCache.has(name)) {
      this.debuggerCache.set(name, createDebug(`plugin:${name}`));
    }

    return this.debuggerCache.get(name)!;
  }
}

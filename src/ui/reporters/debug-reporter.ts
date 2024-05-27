import { PlanResponseData } from 'codify-schemas';
import readline from 'node:readline';
import createDebug, { Debugger } from 'debug';

import { ctx, Event } from '../../events/context.js';
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

  async promptApplyConfirmation(): Promise<boolean> {
    const response = await new Promise((resolve) => {
      this.rl.question('Is this okay?\n', (answer) => resolve(answer));
    });

    return response === 'yes';
  }

  displayPlan(plan: PlanResponseData[]): void {
    console.log(JSON.stringify(plan));
  }

  private getDebug(name: string): Debugger {
    const debuggerName = `plugin:${name}`;

    if (!this.debuggerCache.has(name)) {
      this.debuggerCache.set(name, createDebug(`plugin:${name}`));
    }

    return this.debuggerCache.get(name)!;
  }
}

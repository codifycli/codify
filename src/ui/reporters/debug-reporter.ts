import createDebug, { Debugger } from 'debug';

import { Event, ctx } from '../../events/context.js';
import { PlainReporter } from './plain-reporter.js';

const debug = createDebug('codify');

export class DebugReporter extends PlainReporter{
  private debuggerCache = new Map<string, Debugger>();

  constructor() {
    super(false);

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

  private getDebug(name: string): Debugger {
    if (!this.debuggerCache.has(name)) {
      this.debuggerCache.set(name, createDebug(`plugin:${name}`));
    }

    return this.debuggerCache.get(name)!;
  }
}

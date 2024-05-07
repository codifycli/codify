import { ctx, Event } from '../../events/context.js';
import { Reporter } from './reporter.js';

export class PlainReporter implements Reporter {

  constructor() {
    ctx.on(Event.OUTPUT, (...args) => console.log(...args))
    ctx.on(Event.PROCESS_START, (name) => console.log(name))
    ctx.on(Event.PROCESS_FINISH, (name) => console.log(name))
    ctx.on(Event.SUB_PROCESS_START, (name) => console.log(name))
    ctx.on(Event.SUB_PROCESS_FINISH, (name) => console.log(name))
  }

  async promptConfirmation(): Promise<boolean> {
    return true;
  }

}

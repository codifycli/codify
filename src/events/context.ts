import { EventEmitter } from 'node:events';

export enum Event {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  PLUGIN_STDOUT = 'plugin_stdout',
  PLUGIN_STDERR = 'plugin_stderr',
  DEBUG = 'debug',
  OUTPUT = 'output',
  PROCESS_START = 'process_start',
  PROCESS_FINISH = 'process_finish',
  SUB_PROCESS_START = 'sub_process_start',
  SUB_PROCESS_FINISH = 'sub_process_finish',
}

export enum ProcessName {
  PLAN = 'plan',
  APPLY = 'apply',
  UNINSTALL = 'uninstall',
}

export enum SubProcessName {
  PARSE = 'parse',
  INITIALIZE_PLUGINS = 'initialize_plugins',
  VALIDATE = 'validate',
  GENERATE_PLAN = 'generate_plan',
  APPLYING_RESOURCE = 'apply_resource',
}

export const ctx = new class {
  emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.attachOutputEmitters();
  }

  on(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter {
    return this.emitter.on(eventName, listener);
  }

  log(...args: unknown[]) {
    this.emitter.emit(Event.STDOUT, ...args);
  }

  pluginStdout(...args: unknown[]) {
    this.emitter.emit(Event.PLUGIN_STDOUT, ...args);
  }

  pluginStderr(...args: unknown[]) {
    this.emitter.emit(Event.PLUGIN_STDERR, ...args);
  }

  debug(...args: unknown[]) {
    const debug = process.env.DEBUG;
    if (!debug?.toLowerCase().includes('codify') && !debug?.includes('*')) {
      return;
    }

    this.emitter.emit(Event.DEBUG, ...args);
  }


  processStarted(name: string) {
    this.emitter.emit(Event.PROCESS_START, name);
  }

  processFinished(name: string) {
    this.emitter.emit(Event.PROCESS_FINISH, name);
  }

  subprocessStarted(name: string, additionalName?: string) {
    this.emitter.emit(Event.SUB_PROCESS_START, name, additionalName);
  }

  subprocessFinished(name: string, additionalName?: string) {
    this.emitter.emit(Event.SUB_PROCESS_FINISH, name, additionalName);
  }

  async subprocess<T>(name: string, run: () => Promise<T>): Promise<T> {
    this.emitter.emit(Event.SUB_PROCESS_START, name);
    const result = await run();
    this.emitter.emit(Event.SUB_PROCESS_FINISH, name);
    return result;
  }

  attachOutputEmitters() {
    this.emitter.prependListener(Event.STDOUT, (...args) => this.onOutputEvent(...args));
    this.emitter.prependListener(Event.STDERR, (...args) => this.onOutputEvent(...args));
    this.emitter.prependListener(Event.PLUGIN_STDOUT, (...args) => this.onOutputEvent(...args));
    this.emitter.prependListener(Event.PLUGIN_STDERR, (...args) => this.onOutputEvent(...args));
    this.emitter.prependListener(Event.DEBUG, (...args) => this.onOutputEvent(...args));
  }

  onOutputEvent(...args: unknown[]) {
    this.emitter.emit(Event.OUTPUT, ...args);
  }
}

import type { SudoRequestData, SudoRequestResponseData } from 'codify-schemas';

import { EventEmitter } from 'node:events';

export enum Event {
  DEBUG = 'debug',
  OUTPUT = 'output',
  PLUGIN_STDERR = 'plugin_stderr',
  PLUGIN_STDOUT = 'plugin_stdout',
  PROCESS_FINISH = 'process_finish',
  PROCESS_START = 'process_start',
  STDERR = 'stderr',
  STDOUT = 'stdout',
  SUB_PROCESS_FINISH = 'sub_process_finish',
  SUB_PROCESS_START = 'sub_process_start',
  SUDO_REQUEST = 'sudo_request',
  SUDO_REQUEST_GRANTED = 'sudo_request_granted',
  PRESS_KEY_TO_CONTINUE_REQUEST = 'press_key_to_continue_request',
  PRESS_KEY_TO_CONTINUE_COMPLETED = 'press_key_to_continue_completed',
  CODIFY_LOGIN_CREDENTIALS_REQUEST = 'codify_login_credentials_request',
  CODIFY_LOGIN_CREDENTIALS_COMPLETED = 'codify_login_credentials_completed',
}

export enum ProcessName {
  APPLY = 'apply',
  PLAN = 'plan',
  DESTROY = 'destroy',
  IMPORT = 'import',
  REFRESH = 'refresh',
  INIT = 'init',
  TERMINATE = 'terminate',
}

export enum SubProcessName {
  APPLYING_RESOURCE = 'apply_resource',
  GENERATE_PLAN = 'generate_plan',
  INITIALIZE_PLUGINS = 'initialize_plugins',
  PARSE = 'parse',
  CREATE_ROOT_FILE = 'create_root_file',
  VALIDATE = 'validate',
  GET_REQUIRED_PARAMETERS = 'get_required_parameters',
  IMPORT_RESOURCE = 'import_resource',
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

  once(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter {
    return this.emitter.once(eventName, listener);
  }

  log(...args: unknown[]) {
    this.emitter.emit(Event.STDOUT, ...args);
  }

  pluginStdout(name: string, ...args: unknown[]) {
    this.emitter.emit(Event.PLUGIN_STDOUT, name, ...args);
  }

  pluginStderr(name: string, ...args: unknown[]) {
    this.emitter.emit(Event.PLUGIN_STDERR, name, ...args);
  }

  debug(...args: unknown[]) {
    const debug = process.env.DEBUG;
    if (!debug?.toLowerCase().includes('codify') && !debug?.includes('*')) {
      return;
    }

    this.emitter.emit(Event.DEBUG, ...args);
  }

  async process<T>(name: string, fn: (() => Promise<T>)): Promise<T> {
    this.processStarted(name);
    const result = await fn();
    this.processFinished(name);

    return result;
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

  sudoRequested(pluginName: string, data: SudoRequestData) {
    this.emitter.emit(Event.SUDO_REQUEST, pluginName, data);
  }

  sudoRequestGranted(pluginName: string, data: SudoRequestResponseData) {
    this.emitter.emit(Event.SUDO_REQUEST_GRANTED, pluginName, data);
  }

  pressToContinueRequested(pluginName: string, data: any) {
    this.emitter.emit(Event.PRESS_KEY_TO_CONTINUE_REQUEST, pluginName, data);
  }

  pressKeyToContinueCompleted(pluginName: string) {
    this.emitter.emit(Event.PRESS_KEY_TO_CONTINUE_COMPLETED, pluginName);
  }

  codifyLoginRequested(pluginName: string) {
    this.emitter.emit(Event.CODIFY_LOGIN_CREDENTIALS_REQUEST, pluginName);
  }

  codifyLoginCompleted(pluginName: string, credentials: string) {
    this.emitter.emit(Event.CODIFY_LOGIN_CREDENTIALS_COMPLETED, pluginName, credentials);
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
    this.emitter.prependListener(Event.PLUGIN_STDOUT, (name, ...args) => this.onOutputEvent(...args));
    this.emitter.prependListener(Event.PLUGIN_STDERR, (name, ...args) => this.onOutputEvent(...args));
    this.emitter.prependListener(Event.DEBUG, (...args) => this.onOutputEvent(...args));
  }

  onOutputEvent(...args: unknown[]) {
    this.emitter.emit(Event.OUTPUT, ...args);
  }
}

import { ApplyNoteRequestData, CommandRequestData, CommandRequestResponseData } from '@codifycli/schemas';
import { EventEmitter } from 'node:events';
import { SecretRedactor } from '../utils/secret-redactor.js';

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
  COMMAND_REQUEST = 'command_request',
  COMMAND_REQUEST_GRANTED = 'command_request_granted',
  PRESS_KEY_TO_CONTINUE_REQUEST = 'press_key_to_continue_request',
  PRESS_KEY_TO_CONTINUE_COMPLETED = 'press_key_to_continue_completed',
  CODIFY_LOGIN_CREDENTIALS_REQUEST = 'codify_login_credentials_request',
  CODIFY_LOGIN_CREDENTIALS_COMPLETED = 'codify_login_credentials_completed',
  APPLY_NOTE_REQUEST = 'apply_note_request',
  /** Output of the commands a plugin runs. Not shown by default: CommandOutputMonitor decides (see Event.OUTPUT) */
  PLUGIN_COMMAND_OUTPUT = 'plugin_command_output',
  /** Short status warnings shown to the user (ex: a resource apply that is taking a while) */
  WARNING = 'warning',
}

export enum ProcessName {
  TEST = 'test',
  APPLY = 'apply',
  PLAN = 'plan',
  DESTROY = 'destroy',
  IMPORT = 'import',
  REFRESH = 'refresh',
  INIT = 'init',
  TERMINATE = 'terminate',
}

export enum SubprocessFinishStatus {
  SUCCESS,
  FAILED,
  SKIPPED,
}

export enum SubProcessName {
  APPLYING_RESOURCE = 'apply_resource_',
  GENERATE_PLAN = 'generate_plan',
  INITIALIZE_PLUGINS = 'initialize_plugins',
  PARSE = 'parse',
  CREATE_ROOT_FILE = 'create_root_file',
  VALIDATE = 'validate',
  GET_REQUIRED_PARAMETERS = 'get_required_parameters',
  IMPORT_RESOURCE = 'import_resource',
  FIND_EXISTING_RESOURCES = 'find_existing_resources',
  TEST_INITIALIZE_AND_VALIDATE = 'test_initialize_and_validate',
  TEST_CHECKING_VM_INSTALLED = 'test_checking_vm_installed',
  TEST_STARTING_VM = 'test_starting_vm',
  TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL = 'test_copying_over_configs_and_opening_terminal',
  TEST_USER_CONTINUE_ON_VM = 'test_user_continue_on_vm',
  TEST_DELETING_VM = 'test_deleting_vm',
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

  off(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter {
    return this.emitter.off(eventName, listener);
  }

  // Redacting writers for plugin output, by event and plugin (see SecretRedactor.stream)
  private readonly pluginStreams = new Map<string, (chunk: string) => void>();

  log(...args: unknown[]) {
    const message = SecretRedactor.redact(args.join(' '));
    this.emitter.emit(Event.STDOUT, message.endsWith('\n') ? message : message + '\n');
  }

  pluginStdout(name: string, ...args: unknown[]) {
    this.emitPluginOutput(Event.PLUGIN_STDOUT, name, args);
  }

  pluginStderr(name: string, ...args: unknown[]) {
    this.emitPluginOutput(Event.PLUGIN_STDERR, name, args);
  }

  /** Output of a command run for a plugin. Shown only in verbose mode or for a slow resource (CommandOutputMonitor) */
  pluginCommandOutput(name: string, ...args: unknown[]) {
    this.emitPluginOutput(Event.PLUGIN_COMMAND_OUTPUT, name, args);
  }

  warn(message: string) {
    this.emitter.emit(Event.WARNING, SecretRedactor.redact(message));
  }

  /** Plugin output with the values of secrets masked */
  private emitPluginOutput(event: Event.PLUGIN_COMMAND_OUTPUT | Event.PLUGIN_STDERR | Event.PLUGIN_STDOUT, name: string, args: unknown[]) {
    if (!SecretRedactor.isActive) {
      this.emitter.emit(event, name, ...args);
      return;
    }

    const key = `${event}:${name}`;
    let write = this.pluginStreams.get(key);
    if (!write) {
      write = SecretRedactor.stream((text) => this.emitter.emit(event, name, text));
      this.pluginStreams.set(key, write);
    }

    write(args.join(''));
  }

  debug(...args: unknown[]) {
    const debug = process.env.DEBUG;
    if (!debug?.toLowerCase().includes('codify') && !debug?.includes('*')) {
      return;
    }

    const message = SecretRedactor.redact(args.join(' '));
    this.emitter.emit(Event.DEBUG, message.endsWith('\n') ? message : message + '\n');
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

  subprocessFinished(name: string, additionalName?: string, status: SubprocessFinishStatus = SubprocessFinishStatus.SUCCESS) {
    this.emitter.emit(Event.SUB_PROCESS_FINISH, name, additionalName, status);
  }

  commandRequested(pluginName: string, data: CommandRequestData) {
    this.emitter.emit(Event.COMMAND_REQUEST, pluginName, data);
  }

  commandRequestCompleted(pluginName: string, data: CommandRequestResponseData) {
    this.emitter.emit(Event.COMMAND_REQUEST_GRANTED, pluginName, data);
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

  applyNoteRequested(pluginName: string, data: ApplyNoteRequestData) {
    this.emitter.emit(Event.APPLY_NOTE_REQUEST, pluginName, data);
  }

  async subprocess<T>(name: string, run: () => Promise<T>): Promise<T> {
    this.emitter.emit(Event.SUB_PROCESS_START, name);
    const result = await run();
    this.emitter.emit(Event.SUB_PROCESS_FINISH, name, undefined, SubprocessFinishStatus.SUCCESS);
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

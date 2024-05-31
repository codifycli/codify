import { IpcMessage, IpcMessageSchema, MessageCmd, SudoRequestData, SudoRequestDataSchema } from 'codify-schemas';
import { ChildProcess, fork } from 'node:child_process';
import { createRequire } from 'node:module';

import { ctx, Event } from '../events/context.js';
import { ajv } from '../utils/ajv.js';
import { PluginMessage } from './message.js';

const ipcMessageValidator = ajv.compile(IpcMessageSchema);
const sudoRequestValidator = ajv.compile(SudoRequestDataSchema);


type Resolve<T> = (value: T) => void;
type Reject = (reason?: Error) => void;

const resultFunctionName = (cmd: string) => `${cmd}_Response`;

export class PluginProcess {
  process: ChildProcess;

  static async start(pluginPath: string, name: string): Promise<PluginProcess> {
    const isTypescript = pluginPath.endsWith('.ts');
    const isTsxInstalled = PluginProcess.isTsxInstalled();

    if (isTypescript && !isTsxInstalled) {
      throw new Error('Typescript plugins are only allowed for dev mode. TS plugins are not allowed for production');
    }

    ctx.log(`Starting plugin ${name}`);

    const _process = fork(
      pluginPath,
      [],
      {
        env: { ...process.env, DEBUG_COLORS: '1', FORCE_COLOR: '1' },
        silent: true,
        ...(isTypescript && { execArgv: ['--import', 'tsx'] }),
      },
    );

    _process.stdout!.on('data', (message) => ctx.pluginStdout(name, message.toString('utf8')));
    _process.stderr!.on('data', (message) => ctx.pluginStderr(name, message.toString('utf8')));
    _process.on('exit', (code) => {
      throw new Error(`Plugin ${this.name} exited with code ${code}`);
    })
    PluginProcess.handleSudoRequests(_process);

    return new PluginProcess(_process);
  }

  constructor(process: ChildProcess) {
    this.process = process;
  }

  async sendMessageForResult(message: PluginMessage): Promise<IpcMessage> {
    return new Promise((resolve, reject) => {
      const handler = new SendMessageForResultHandler(message, this.process, resolve, reject);

      this.process.on('message', handler.messageListener);
      this.process.send(message);
    });
  }

  sendMessage(message: PluginMessage): void {
    this.process.send(message);
  }

  // Tsx is only installed for dev builds. Only allow typescript plugins for testing.
  private static isTsxInstalled(): boolean {
    try {
      const require = createRequire(import.meta.url);
      require.resolve('tsx');
    } catch {
      return false;
    }

    return true;
  }

  private static handleSudoRequests(process: ChildProcess) {
    // Listen for incoming sudo incoming sudo requests
    process.on('message', (message) => {
      if (!ipcMessageValidator(message)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      if (message.cmd === MessageCmd.SUDO_REQUEST) {
        const { data } = message;
        if (!sudoRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin ${this.name}. ${JSON.stringify(sudoRequestValidator.errors, null, 2)}`);
        }

        ctx.sudoRequested(this.name, data as unknown as SudoRequestData);
      }
    })

    // Send out sudo granted events
    ctx.on(Event.SUDO_REQUEST_GRANTED, (pluginName, data) => {
      if (pluginName === this.name) {
        process.send({
          cmd: resultFunctionName(MessageCmd.SUDO_REQUEST),
          data
        })
      }
    })
  }
}

class SendMessageForResultHandler {
  messageToSend: PluginMessage;
  process: ChildProcess;
  promiseResolve: Resolve<IpcMessage>;
  promiseReject: Reject;
  timer: NodeJS.Timeout;

  constructor(
    messageToSend: PluginMessage,
    process: ChildProcess,
    resolve: Resolve<IpcMessage>,
    reject: Reject,
    timeout = 600_000, // Default time is 10 minutes for a command
  ) {
    this.messageToSend = messageToSend;
    this.process = process;
    this.promiseResolve = resolve;
    this.promiseReject = reject;
    this.timer = this.setResultTimeout(timeout);
  }

  messageListener = (incomingMessage: unknown) => {
    ctx.debug(JSON.stringify(incomingMessage, null, 2));

    if (!this.validateIpcMessage(incomingMessage)) {
      return this.reject(new Error(`Invalid message from plugin. ${JSON.stringify(incomingMessage, null, 2)}`))
    }

    if (incomingMessage.cmd === resultFunctionName(this.messageToSend.cmd)) {
      this.resolve(incomingMessage);
    }
  };

  reject = (err: Error) => {
    if (this.timer.hasRef()) {
      clearTimeout(this.timer);
    }

    this.process.removeListener('message', this.messageListener);
    this.promiseReject(err);
  }

  private resolve = (value: IpcMessage) => {
    if (this.timer.hasRef()) {
      clearTimeout(this.timer);
    }

    this.process.removeListener('message', this.messageListener);
    this.promiseResolve(value);
  }

  private setResultTimeout = (timeout: number) => setTimeout(() => {
    this.reject(new Error(`Plugin did not respond in 10 minutes to call: ${this.messageToSend.cmd}`))
  }, timeout);

  private validateIpcMessage(response: unknown): response is IpcMessage {
    return ipcMessageValidator(response);
  }
}


import { IpcMessage, IpcMessageSchema } from 'codify-schemas';
import { ChildProcess, fork } from 'node:child_process';

import { ctx } from '../orchestrators/context.js';
import { ajv } from '../utils/ajv.js';
import { PluginMessage } from './message.js';

const ipcMessageValidator = ajv.compile(IpcMessageSchema);

type Resolve = (value: unknown) => void;
type Reject = (reason?: Error) => void;

const resultFunctionName = (cmd: string) => `${cmd}_Response`;

export class PluginProcess {
  process: ChildProcess;

  constructor(process: ChildProcess) {
    this.process = process;
  }

  static async start(jsFileDir: string): Promise<PluginProcess> {
    const _process = fork(
      jsFileDir,
      [],
      {
        env: { ...process.env, FORCE_COLOR: '1' },
        execArgv: ['--import', 'tsx'],
        silent: true
      },
    );

    _process.stdout!.on('data', (message) => ctx.pluginStdout(message.toString('utf8')));
    _process.stderr!.on('data', (message) => ctx.pluginStderr(message.toString('utf8')));


    return new PluginProcess(_process);
  }

  killPlugin(): void {
    this.process.kill();
  }

  async sendMessageForResult(message: PluginMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const handler = new SendMessageForResultHandler(message, this.process, resolve, reject);

      this.process.on('message', handler.messageListener);
      this.process.send(message);
    });
  }

  sendMessage(message: PluginMessage): void {
    this.process.send(message);
  }
}

class SendMessageForResultHandler {
  messageToSend: PluginMessage;
  process: ChildProcess;
  promiseResolve: Resolve;
  promiseReject: Reject;
  timer: NodeJS.Timeout;

  constructor(
    messageToSend: PluginMessage,
    process: ChildProcess,
    resolve: Resolve,
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
      return this.reject(new Error(`Bad message from plugin. ${JSON.stringify(incomingMessage, null, 2)}`))
    }

    if (incomingMessage.cmd === resultFunctionName(this.messageToSend.cmd)) {
      this.resolve(incomingMessage.data);
    }
  };

  reject = (err: Error) => {
    if (this.timer.hasRef()) {
      clearTimeout(this.timer);
    }

    this.process.removeListener('message', this.messageListener);
    this.promiseReject(err);
  }

  private resolve = (value: unknown) => {
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


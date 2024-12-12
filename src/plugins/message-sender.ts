import { IpcMessageV2 } from 'codify-schemas';
import { ChildProcess } from 'node:child_process';
import { clearTimeout } from 'node:timers';

import { ctx } from '../events/context.js';
import { ipcMessageValidator, returnMessageCmd } from './plugin-process.js';

type Resolve<T> = (value: T) => void;
type Reject = (reason?: Error) => void;

// Default timeout is 10 minutes after last message, stdout, or stderr
const TIMEOUT = 6_000_000

export class MessageForResultSender {
  cmd: string;
  resultCmd: string;
  promiseResolve: Resolve<IpcMessageV2>;
  promiseReject: Reject;
  timerId!: NodeJS.Timeout;
  timeout: number;

  private constructor(
    cmd: string,
    resolve: Resolve<IpcMessageV2>,
    reject: Reject,
    timeout = TIMEOUT,
  ) {
    this.cmd = cmd;
    this.resultCmd = returnMessageCmd(cmd);
    this.promiseResolve = resolve;
    this.promiseReject = reject;
    this.timeout = timeout;

    this.startOrResetTimeout();
  }

  static async send(message: IpcMessageV2, process: ChildProcess, timeout = TIMEOUT): Promise<IpcMessageV2> {
    let handler: MessageForResultSender;

    return new Promise<IpcMessageV2>((resolve, reject) => {
      handler = new MessageForResultSender(message.cmd, resolve, reject, timeout);

      // Sets listeners
      process.on('message', handler.messageListener);
      process.stdout?.on('data', handler.startOrResetTimeout)
      process.stderr?.on('data', handler.startOrResetTimeout)

      process.send(message);
    }).finally(() => {

      // Removes all listeners
      process.removeListener('message', handler.messageListener);
      process.stdout?.removeListener('data', handler.startOrResetTimeout)
      process.stderr?.removeListener('data', handler.startOrResetTimeout)
      clearTimeout(handler.timerId);
    });
  }

  private messageListener = (incomingMessage: unknown) => {
    ctx.debug(JSON.stringify(incomingMessage, null, 2));

    if (!this.validateIpcMessage(incomingMessage)) {
      return this.reject(new Error(`Invalid message from plugin. ${JSON.stringify(incomingMessage, null, 2)}`))
    }

    if (incomingMessage.cmd === this.resultCmd) {
      this.resolve(incomingMessage);
    } else {
      this.startOrResetTimeout();
    }
  };

  private reject = (err: Error) => {
    if (this.timerId.hasRef()) {
      clearTimeout(this.timerId);
    }

    this.promiseReject(err)
  }

  private resolve = (value: IpcMessageV2) => {
    if (this.timerId.hasRef()) {
      clearTimeout(this.timerId);
    }

    this.promiseResolve(value)
  }

  private startOrResetTimeout = () => {
    if (this.timerId?.hasRef()) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(() => {

      // Use date here to convert ms to minutes
      const date = new Date(this.timeout)
      this.reject(new Error(`Plugin did not respond in ${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')} minutes: ${this.cmd}`))
    }, this.timeout);
  }

  private validateIpcMessage(response: unknown): response is IpcMessageV2 {
    return ipcMessageValidator(response);
  }
}

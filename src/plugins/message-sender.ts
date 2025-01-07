import { IpcMessageV2 } from 'codify-schemas';
import { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { clearTimeout } from 'node:timers';

import { ctx } from '../events/context.js';
import { PluginMessage } from './plugin-message.js';
import { ipcMessageValidator } from './plugin-process.js';

type Resolve<T> = (value: T) => void;
type Reject = (reason?: Error) => void;

EventEmitter.defaultMaxListeners = 100;

// Default timeout is 10 minutes after last message, stdout, or stderr
const TIMEOUT = 6_000_000

export async function sendIpcMessageForResult(message: PluginMessage, process: ChildProcess, timeout = TIMEOUT): Promise<PluginMessage> {
  let handler: MessageForResultHandler;

  return new Promise<PluginMessage>((resolve, reject) => {
    handler = new MessageForResultHandler(message, resolve, reject, timeout);

    // Sets listeners
    process.on('message', handler.messageListener);
    process.stdout?.on('data', handler.startOrResetTimeout)
    process.stderr?.on('data', handler.startOrResetTimeout)

    // Send the message
    process.send(message);
  }).finally(() => {
    // Removes all listeners
    process.removeListener('message', handler.messageListener);
    process.stdout?.removeListener('data', handler.startOrResetTimeout)
    process.stderr?.removeListener('data', handler.startOrResetTimeout)
    clearTimeout(handler.timerId);
  });
}

class MessageForResultHandler {
  message: PluginMessage;
  promiseResolve: Resolve<PluginMessage>;
  promiseReject: Reject;
  timerId!: NodeJS.Timeout;
  timeout: number;

  constructor(
    message: PluginMessage,
    resolve: Resolve<PluginMessage>,
    reject: Reject,
    timeout = TIMEOUT,
  ) {
    this.message = message;
    this.promiseResolve = resolve;
    this.promiseReject = reject;
    this.timeout = timeout;

    this.startOrResetTimeout();
  }

  messageListener = (incomingMessage: unknown) => {
    ctx.debug(JSON.stringify(incomingMessage, null, 2));

    const message = PluginMessage.fromUnknown(incomingMessage);
    if (!message) {
      return this.reject(new Error(`Invalid message from plugin. ${JSON.stringify(incomingMessage, null, 2)}`))
    }

    if (this.message.isSameRequest(message)) {
      this.resolve(message);
    } else {
      this.startOrResetTimeout();
    }
  };

  reject = (err: Error) => {
    if (this.timerId.hasRef()) {
      clearTimeout(this.timerId);
    }

    this.promiseReject(err)
  }

  resolve = (value: PluginMessage) => {
    if (this.timerId.hasRef()) {
      clearTimeout(this.timerId);
    }

    this.promiseResolve(value)
  }

  startOrResetTimeout = () => {
    if (this.timerId?.hasRef()) {
      clearTimeout(this.timerId);
    }

    this.timerId = setTimeout(() => {

      // Use date here to convert ms to minutes
      const date = new Date(this.timeout)
      this.reject(new Error(`Plugin did not respond in ${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')} minutes: ${this.message.cmd}`))
    }, this.timeout);
  }

  validateIpcMessage(response: unknown): response is IpcMessageV2 {
    return ipcMessageValidator(response);
  }
}

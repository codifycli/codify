import { IpcMessage, IpcMessageSchema, MessageCmd, SudoRequestData, SudoRequestDataSchema } from 'codify-schemas';
import { ChildProcess, fork } from 'node:child_process';
import { createRequire } from 'node:module';

import { Event, ctx } from '../events/context.js';
import { ajv } from '../utils/ajv.js';
import { MessageForResultSender } from './message-sender.js';

export const ipcMessageValidator = ajv.compile(IpcMessageSchema);
export const sudoRequestValidator = ajv.compile(SudoRequestDataSchema);

export function returnMessageCmd(cmd: string) {
  return `${cmd}_Response`;
}

export class PluginProcess {
  process: ChildProcess;

  static async start(pluginPath: string, name: string, secureMode: boolean): Promise<PluginProcess> {
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
        detached: secureMode,
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
    PluginProcess.handleSudoRequests(_process, name);

    return new PluginProcess(_process);
  }

  constructor(process: ChildProcess) {
    this.process = process;
  }

  private static handleSudoRequests(process: ChildProcess, pluginName: string) {
    // Listen for incoming sudo incoming sudo requests
    process.on('message', (message) => {
      if (!ipcMessageValidator(message)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      if (message.cmd === MessageCmd.SUDO_REQUEST) {
        const { data } = message;
        if (!sudoRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin ${pluginName}. ${JSON.stringify(sudoRequestValidator.errors, null, 2)}`);
        }

        ctx.sudoRequested(pluginName, data as unknown as SudoRequestData);
      }
    })

    // Send out sudo granted events
    ctx.on(Event.SUDO_REQUEST_GRANTED, (_pluginName, data) => {
      if (_pluginName === pluginName) {
        process.send({
          cmd: returnMessageCmd(MessageCmd.SUDO_REQUEST),
          data
        })
      }
    })
  }

  sendMessage(message: IpcMessage): void {
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

  sendMessageForResult(message: IpcMessage): Promise<IpcMessage> {
    return MessageForResultSender.send(message, this.process);
  }
}


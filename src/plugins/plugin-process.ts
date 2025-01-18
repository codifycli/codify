import { IpcMessageV2, IpcMessageV2Schema, MessageCmd, SudoRequestData, SudoRequestDataSchema } from 'codify-schemas';
import { ChildProcess, fork } from 'node:child_process';
import { createRequire } from 'node:module';

import { Event, ctx } from '../events/context.js';
import { ajv } from '../utils/ajv.js';
import { sendIpcMessageForResult } from './message-sender.js';
import { PluginMessage } from './plugin-message.js';

export const ipcMessageValidator = ajv.compile(IpcMessageV2Schema);
export const sudoRequestValidator = ajv.compile(SudoRequestDataSchema);

const DEFAULT_NODE_MODULES_DIR = '/usr/local/lib/codify/node_modules/'

// Find the location of the node_modules of the CLI itself. Plugins depend on a shared instance of node-pty to work (using NODE_PATH)
// ex: /Users/kevinwang/Projects/codify/node_modules/@homebridge/node-pty-prebuilt-multiarch/lib/index.js
const require = createRequire(import.meta.url);
const nodeModulesDir = require.resolve('@homebridge/node-pty-prebuilt-multiarch')
  ?.split('@homebridge/node-pty-prebuilt-multiarch')
  ?.at(0)
  ?? DEFAULT_NODE_MODULES_DIR;

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
        env: { ...process.env, DEBUG_COLORS: '1', FORCE_COLOR: '1', NODE_PATH: nodeModulesDir },
        silent: true,
        ...(isTypescript && { execArgv: ['--import', 'tsx'] }),
      },
    );

    _process.stdout!.on('data', (message) => ctx.pluginStdout(name, message.toString('utf8')));
    _process.stderr!.on('data', (message) => ctx.pluginStderr(name, message.toString('utf8')));
    _process.on('exit', (code) => {
      if (code && code !== 0) {
        throw new Error(`Plugin ${this.name} exited with code ${code}`);
      }
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
      if (!PluginProcess.isIpcMessage(message)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      if (message.cmd === MessageCmd.SUDO_REQUEST) {
        const { data, requestId } = message;
        if (!sudoRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin ${pluginName}. ${JSON.stringify(sudoRequestValidator.errors, null, 2)}`);
        }

        // Send out sudo granted events
        ctx.once(Event.SUDO_REQUEST_GRANTED, (_pluginName, data) => {
          if (_pluginName === pluginName) {
            process.send({
              cmd: returnMessageCmd(MessageCmd.SUDO_REQUEST),
              requestId,
              data
            })
          }
        })

        ctx.sudoRequested(pluginName, data as unknown as SudoRequestData);
      }
    })
  }

  sendMessage(message: IpcMessageV2): void {
    this.process.send(message);
  }

  // Tsx is only installed for dev builds. Only allow typescript plugins for testing.
  private static isTsxInstalled(): boolean {
    try {
      require.resolve('tsx');
    } catch {
      return false;
    }

    return true;
  }

  sendMessageForResult(cmd: string, data: unknown): Promise<PluginMessage> {
    const message = PluginMessage.create(cmd, data);
    return sendIpcMessageForResult(message, this.process);
  }
  
  private static isIpcMessage(message: unknown): message is IpcMessageV2 {
    return ipcMessageValidator(message);
  } 
}


import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { ConfigFileSchema } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

import { ConnectOrchestrator } from '../../../orchestrators/connect.js';
import { ajv } from '../../../utils/ajv.js';
import { ShellUtils } from '../../../utils/shell.js';
import { Session } from '../../socket-server.js';
import { ConnectCommand, createCommandHandler } from '../create-command.js';

const validator = ajv.compile(ConfigFileSchema);

export function planHandler() {
  const spawnCommand = async (body: Record<string, unknown>, ws: WebSocket, session: Session) => {
    const codifyConfig = body.config;
    if (!codifyConfig) {
      throw new Error('Unable to parse codify config');
    }

    if (!validator(codifyConfig)) {
      throw new Error('Invalid codify config');
    }

    const tmpDir = await fs.mkdtemp(os.tmpdir() + '/');
    const filePath = path.join(tmpDir, 'codify.jsonc');
    await fs.writeFile(filePath, JSON.stringify(codifyConfig, null, 2), { });

    session.additionalData.filePath = filePath;

    return spawn(ShellUtils.getDefaultShell(), ['-c', `${ConnectOrchestrator.nodeBinary} ${ConnectOrchestrator.rootCommand} plan -p ${filePath}`], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });
  }

  const onExit = async (exitCode: number, ws: WebSocket, session: Session) => {
    if (session.additionalData.filePath) {
      await fs.rm(session.additionalData.filePath as string, { recursive: true, force: true });
    }
  }

  return createCommandHandler({
    name: ConnectCommand.PLAN,
    spawnCommand,
    onExit
  });
}

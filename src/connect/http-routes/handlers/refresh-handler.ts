import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { ConfigFileSchema } from 'codify-schemas';
import { diffChars } from 'diff';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

import { ConnectOrchestrator } from '../../../orchestrators/connect.js';
import { ajv } from '../../../utils/ajv.js';
import { Session, SocketServer } from '../../socket-server.js';
import { ConnectCommand, createCommandHandler } from '../create-command.js';

enum RefreshType {
  REFRESH = 'refresh',
  REFRESH_SPECIFIC = 'refresh_specific'
}

const validator = ajv.compile(ConfigFileSchema);

export function refreshHandler() {
  const spawnCommand = async (body: Record<string, unknown>, ws: WebSocket, session: Session) => {
    const { config: codifyConfig, type, resourceTypes } = body;
    if (!codifyConfig) {
      throw new Error('Unable to parse codify config');
    }

    if (!type || !Object.values(RefreshType).includes(type as RefreshType)) {
      throw new Error('Unable to parse import type');
    }

    if (type === RefreshType.REFRESH_SPECIFIC && (!resourceTypes || !Array.isArray(resourceTypes))) {
      throw new Error(`For refresh specific, a list of resource types must be provided, received: ${resourceTypes}`);
    }

    if (!validator(codifyConfig)) {
      throw new Error('Invalid codify config');
    }
    
    const tmpDir = await fs.mkdtemp(os.tmpdir());
    const filePath = path.join(tmpDir, 'codify.jsonc');
    await fs.writeFile(filePath, JSON.stringify(codifyConfig, null, 2));
    session.additionalData.filePath = filePath;
    session.additionalData.existingFile = codifyConfig;

    let args = '';
    switch (type as RefreshType) {
      case RefreshType.REFRESH: {
        break;
      }

      case RefreshType.REFRESH_SPECIFIC: {
        args = (resourceTypes as string[]).join(' ');
        break;
      }
    }

    return spawn('zsh', ['-c', `${ConnectOrchestrator.nodeBinary} ${ConnectOrchestrator.rootCommand} refresh ${args} -p ${filePath}`], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });
  }

  const onExit = async (exitCode: number, ws: WebSocket, session: Session) => {
    if (session.additionalData.filePath) {
      const updatedFile = await fs.readFile(session.additionalData.filePath as string, 'utf8')

      // Changes were found
      if (diffChars(updatedFile, session.additionalData.existingFile as string).length > 0) {
        console.log('Writing imported changes to Codify dashboard');

        await fs.rm(session.additionalData.filePath as string, { recursive: true, force: true });
        return { updated: updatedFile };
      }
    }
  }

  return createCommandHandler({
    name: ConnectCommand.REFRESH,
    spawnCommand,
    onExit
  });
}

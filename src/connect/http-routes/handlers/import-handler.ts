import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { ConfigFileSchema } from 'codify-schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

import { ConnectOrchestrator } from '../../../orchestrators/connect.js';
import { ajv } from '../../../utils/ajv.js';
import { Session, SocketServer } from '../../socket-server.js';
import { ConnectCommand, createCommandHandler } from './create-command.js';

enum ImportType {
  REFRESH = 'refresh',
  NEW_RESOURCES = 'new_resources',
  NEW_ALL = 'new_all',
}

const validator = ajv.compile(ConfigFileSchema);

export function importHandler() {
  const spawnCommand = async (body: Record<string, unknown>, ws: WebSocket, session: Session) => {
    const { config: codifyConfig, type, resourceTypes } = body;
    if (!codifyConfig) {
      throw new Error('Unable to parse codify config');
    }

    if (!type || !Object.values(ImportType).includes(type as ImportType)) {
      throw new Error('Unable to parse import type');
    }

    if (type === ImportType.NEW_RESOURCES && (!resourceTypes || Array.isArray(resourceTypes))) {
      throw new Error('For new resources import type, a list of resource types must be provided');
    }

    if (!validator(codifyConfig)) {
      throw new Error('Invalid codify config');
    }
    
    const tmpDir = await fs.mkdtemp(os.tmpdir());
    const filePath = path.join(tmpDir, 'codify.jsonc');
    await fs.writeFile(filePath, JSON.stringify(codifyConfig, null, 2));
    session.additionalData.filePath = filePath;

    let args = '';
    switch (type as ImportType) {
      case ImportType.REFRESH: { 
        break;
      }

      case ImportType.NEW_RESOURCES: {
        args = (resourceTypes as string[]).join(' ');
        break;
      }
 
      case ImportType.NEW_ALL: {
        args = '*'
        break;
      } 
    }

    return spawn('zsh', ['-c', `${ConnectOrchestrator.rootCommand} import ${args} -p ${filePath}`], {
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
    name: ConnectCommand.APPLY,
    spawnCommand,
    onExit
  });
}

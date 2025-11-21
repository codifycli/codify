import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { diffChars } from 'diff';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

import { ConnectOrchestrator } from '../../../orchestrators/connect.js';
import { Session, SocketServer } from '../../socket-server.js';
import { ConnectCommand, createCommandHandler } from '../create-command.js';

export function initHandler() {
  const spawnCommand = async (body: Record<string, unknown>, ws: WebSocket, session: Session) => {
    const tmpDir = await fs.mkdtemp(os.tmpdir());
    const filePath = path.join(tmpDir, 'codify.jsonc');
    await fs.writeFile(filePath, '[]');
    session.additionalData.filePath = filePath;
    session.additionalData.existingFile = '[]';

    return spawn('zsh', ['-c', `${ConnectOrchestrator.nodeBinary} ${ConnectOrchestrator.rootCommand} init -p ${filePath}`], {
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

        const ws = SocketServer.get().getMainConnection(session.clientId);
        if (!ws) {
          throw new Error(`Unable to find client for clientId ${session.clientId}`);
        }

        await fs.rm(session.additionalData.filePath as string, { recursive: true, force: true });
        return { updated: updatedFile };
      }
    }
  }

  return createCommandHandler({
    name: ConnectCommand.IMPORT,
    spawnCommand,
    onExit
  });
}

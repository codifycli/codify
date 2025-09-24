import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import chalk from 'chalk';
import { Router } from 'express';

import { ConnectOrchestrator } from '../../../orchestrators/connect.js';
import { SocketServer } from '../../socket-server.js';

export enum ConnectCommand {
  TERMINAL = 'terminal',
  APPLY = 'apply',
  PLAN = 'plan',
  IMPORT = 'import'
}

const CommandInfo = {
  [ConnectCommand.TERMINAL]: {
    command: () => [],
    requiresDocumentId: false,
  },
  [ConnectCommand.APPLY]: {
    command: (args) => ['-c', `${ConnectOrchestrator.rootCommand} apply ${args}`],
    requiresDocumentId: true,
  },
  [ConnectCommand.PLAN]: {
    command: (args) => ['-c', `${ConnectOrchestrator.rootCommand} plan ${args}`],
    requiresDocumentId: true,
  },
  [ConnectCommand.IMPORT]: {
    command: (args) => ['-c', `${ConnectOrchestrator.rootCommand} import -p ${args}`],
    requiresDocumentId: true,
  }
}

export function createCommandHandler(command: ConnectCommand): Router {
  if (!Object.values(ConnectCommand).includes(command)) {
    throw new Error(`Unknown command ${command}. Please check code`);
  }

  const commandInfo = CommandInfo[command];
  if (!commandInfo) {
    throw new Error(`Command info not provided for ${command}. Please check code`);
  }

  const router = Router({
    mergeParams: true,
  });

  router.post('/:sessionId/start', async (req, res) => {
    const { sessionId } = req.params;
    const { documentId } = req.body;
    console.log(`Received request to ${command}, sessionId: ${sessionId}`)

    if (!sessionId) {
      return res.status(400).json({ error: 'SessionId must be provided' });
    }

    if (commandInfo.requiresDocumentId && !documentId) {
      return res.status(400).json({ error: 'Document id must be provided' });
    }

    const manager = SocketServer.get();
    const session = manager.getSession(sessionId);
    if (!session) {
      return res.status(400).json({ error: 'SessionId does not exist' });
    }

    const { ws, server } = session;
    if (!ws) {
      return res.status(400).json({ error: 'SessionId not open' });
    }

    if (session.pty) {
      return res.status(304).json({ status: 'Already started' })
    }

    console.log('Running command:', commandInfo.command(documentId))
    const pty = spawn('zsh', commandInfo.command(documentId), {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });

    session.pty = pty;

    pty.onData((data) => {
      ws.send(Buffer.from(data, 'utf8'));
    });

    ws.on('message', (message) => {
      pty.write(message.toString('utf8'));
    })

    pty.onExit(({ exitCode, signal }) => {
      console.log('pty exit', exitCode, signal);
      ws.send(Buffer.from(chalk.blue(`Session ended exit code ${exitCode}`), 'utf8'))

      ws.terminate();
      server.close();
    })

    ws.on('close', () => {
      console.log('Session ws closed. Shutting down pty');
      pty.kill();
      manager.removeSession(sessionId)
    })

    return res.status(204).json({});
  });

  return router;
}

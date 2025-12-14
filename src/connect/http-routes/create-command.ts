import { IPty, spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import chalk from 'chalk';
import { Router } from 'express';
import WebSocket from 'ws';

import { Session, SocketServer } from '../socket-server.js';

export enum ConnectCommand {
  TERMINAL = 'start terminal',
  APPLY = 'apply',
  PLAN = 'plan',
  IMPORT = 'import',
  REFRESH = 'refresh',
  INIT = 'init',
}

interface Params {
  name: ConnectCommand;
  command?: string[];
  spawnCommand?: (body: Record<string, unknown>, ws: WebSocket, session: Session) => IPty | Promise<IPty>;
  onExit?: (exitCode: number, ws: WebSocket, session: Session) => Promise<Record<string, unknown> | undefined | void>;
}

export function createCommandHandler({ name, command, spawnCommand, onExit }: Params): Router {
  if (!Object.values(ConnectCommand).includes(name)) {
    throw new Error(`Unknown command ${name}. Please check code`);
  }

  if (!command && !spawnCommand) {
    throw new Error('One of command or spawnCommand must be provided to createCommandHandler');
  }

  const router = Router({
    mergeParams: true,
  });

  router.post('/:sessionId/start', async (req, res) => {
    const { sessionId } = req.params;
    console.log(`Received request to ${name}, sessionId: ${sessionId}`)

    if (!sessionId) {
      return res.status(400).json({ error: 'SessionId must be provided' });
    }

    const manager = SocketServer.get();
    const session = manager.getSession(sessionId);
    if (!session) {
      return res.status(400).json({ error: 'SessionId does not exist' });
    }

    const { ws, server, clientId } = session;
    if (!ws) {
      return res.status(400).json({ error: 'SessionId not open' });
    }

    if (session.pty) {
      return res.status(304).json({ status: 'Already started' })
    }

    console.log(req.body);

    const pty = spawnCommand ? await spawnCommand(req.body, ws, session) : spawn('zsh', command!, {
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

    pty.onExit(async ({ exitCode, signal }) => {
      console.log(`Command ${name} exited with exit code`, exitCode);
      ws.send(Buffer.from(chalk.blue(`Session ended exit code ${exitCode}`), 'utf8'))

      const mainWs = SocketServer.get().getMainConnection(clientId);
      if (mainWs) {
        const data = await onExit?.(exitCode, ws, session) ?? {}
        mainWs.send(JSON.stringify({ key: `finish:${sessionId}`, success: exitCode === 0, data })) // Send finish command only if client connection is still open
      }

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

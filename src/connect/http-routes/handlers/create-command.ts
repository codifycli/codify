import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { Router } from 'express';

import { SocketServer } from '../../socket-server.js';

export function createCommandHandler(command: string, args?: string): Router {
  const router = Router({
    mergeParams: true,
  });

  router.post('/:sessionId/start', async (req, res) => {
    const { sessionId } = req.params;
    console.log(`Received request to ${command}, sessionId: ${sessionId}`)

    if (!sessionId) {
      return res.status(400).json({ error: 'SessionId must be provided' });
    }

    const manager = SocketServer.get();
    const session = manager.getSession(sessionId);
    if (!session) {
      return res.status(400).json({ error: 'SessionId does not exist' });
    }

    const {ws, server} = session;
    if (!ws) {
      return res.status(400).json({ error: 'SessionId not open' });
    }

    const pty = spawn('zsh', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });

    pty.onData((data) => {
      ws.send(Buffer.from(data, 'utf8'));
    });

    ws.on('message', (message) => {
      pty.write(message.toString('utf8'));
    })

    pty.onExit(({ exitCode, signal }) => {
      console.log('pty exit', exitCode, signal);
      ws.terminate();
      server.close();
    })
  });

  return router;
}
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

    const server = SocketServer.get();
    const socket = server.getSession(sessionId);
    if (!socket) {
      return res.status(400).json({ error: 'SessionId does not exist' });
    }

    if (!socket.connected) {
      return res.status(400).json({ error: 'Socket not connected. Connect to socket before calling this endpoint' });
    }

    const pty = spawn('zsh', ['-c',  `codify ${command} ${args ?? ''}`], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });

    pty.onData((data) => {
      socket.emit('data', Buffer.from(data, 'utf8'));
    });

    socket.on('data', (message) => {
      pty.write(message.toString('utf8'));
    })

    pty.onExit(({ exitCode, signal }) => {
      console.log('pty exit', exitCode, signal);
      // socket.disconnect();
    })
  });

  return router;
}
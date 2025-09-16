import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { Router } from 'express';

import { SocketServer } from '../../socket-server.js';

export enum ConnectCommand {
  TERMINAL = 'terminal',
  APPLY = 'apply',
  PLAN = 'plan',
  IMPORT = 'import'
}

const CommandInfo = {
  [ConnectCommand.TERMINAL]: {
    args: [],
  },
  [ConnectCommand.APPLY]: {
    args: ['-c', 'codify apply']
  }

}

export function createCommandHandler(command: ConnectCommand): Router {
  // if (!Object.values(ConnectCommand).includes(command)) {
  //   throw new Error(`Unknown command ${command}. Please check code`);
  // }
  //
  // const commandInfo = CommandInfo[command];
  // if (!commandInfo) {
  //   throw new Error(`Command info not provided for ${command}. Please check code`);
  // }

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

    const { ws, server } = session;
    if (!ws) {
      return res.status(400).json({ error: 'SessionId not open' });
    }

    if (session.pty) {
      return res.status(304).json({ status: 'Already started' })
    }

    const pty = spawn('zsh', [], {
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
      ws.terminate();
      server.close();
    })


    return res.status(204).json({});
  });

  return router;
}
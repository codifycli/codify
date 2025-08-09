import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { ResourceConfig } from 'codify-schemas';
import { Router } from 'express';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { v4 as uuid } from 'uuid';
import { WebSocket } from 'ws';

import { WsServerManager } from './server.js';

const router = Router({
  mergeParams: true,
});

router.post('/apply', (req, res) => {
  const sessionId = uuid();
  const manager = WsServerManager.get();
  const config = req.body;

  manager.addAdhocWsServer(sessionId, async (ws: WebSocket) => wsHandler(ws, config));

  return res.status(200).json({ sessionId });
});

async function wsHandler(ws: WebSocket, config: ResourceConfig): Promise<void> {
  const tmpDir = await fs.mkdtemp(os.tmpdir());
  const filePath = path.join(tmpDir, 'codify.json');

  await fs.writeFile(filePath, JSON.stringify(config));

  const pty = spawn('zsh', ['-c',  'codify apply'], {
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
  })
}

export default router;

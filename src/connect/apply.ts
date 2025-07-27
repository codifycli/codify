import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { v4 as uuid } from 'uuid';
import { WebSocket } from 'ws';

import { WsServerManager } from './server.js';

export function connectApplyInitHandler(msg: any, initWs: WebSocket, manager: WsServerManager) {
  const sessionId = uuid();

  manager.startAdhocWsServer(sessionId, async (ws) => {
    console.log('connected apply ws');

    const { config } = msg;
    console.log('apply ws open', config);

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
      // ws.close(exitCode);
      ws.terminate();
    })
  });

  initWs.send(JSON.stringify({
    cmd: 'apply_init_response',
    sessionId,
  }))
}

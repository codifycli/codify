import { spawn } from '@homebridge/node-pty-prebuilt-multiarch';
import { randomBytes } from 'node:crypto';
import open from 'open';
import { WebSocket } from 'ws';

import { defaultWsHandler } from '../connect/route-handler.js';
import { WsServerManager } from '../connect/server.js';

export class ConnectOrchestrator {
  static async run() {
    const connectionSecret = ConnectOrchestrator.tokenGenerate()
    console.log(connectionSecret)

    const server = new WsServerManager(connectionSecret)
      .setDefaultHandler(defaultWsHandler)
      .addAdditionalHandlers('/apply-logs', () => {})
      .addAdditionalHandlers('/import-logs', () => {})
      .addAdditionalHandlers('/terminal', () => {})

    server.listen(() => {
      open(`http://localhost:3000/connection/success?code=${connectionSecret}`)
    });
  }

  private static onConnection(ws: WebSocket) {
    console.log('[WS] Connection opened');

    ws.on('apply', (message) => {
      let data;
      try {
        data = JSON.parse(message.toString('utf8'));
        console.log(data);
      } catch (error) {
        console.error(error);
      }

    });

    ws.on('close', () => {

    });
  }

  /*
  private static async onApply(ws: WebSocket, data: any) {
    const { config } = data;
    const tmpDir = await fs.mkdtemp(os.tmpdir());
    const filePath = path.join(tmpDir, 'codify.json');

    await fs.writeFile(filePath, JSON.stringify(config));

    const server = createServer()
    const wss = new WebSocketServer({

    })

    server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws2) => {
        const pty = spawn('zsh', ['-c', '"codify apply"'], {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: process.env.HOME,
          env: process.env
        });

        pty.onData((data) => {
          ws2.send(Buffer.from(data, 'utf8'));
        });

        ws2.on('message', (message) => {
          pty.write(message.toString('utf8'));
        })

        pty.onExit((code) => {
          ws2.close(code, code);
        })
      })
    });

    server.listen(2123, () => {
      ws.emit('apply_Response', {
        wsPass: 'pass',
      })
    })
  } */

  private static tokenGenerate(length = 20): string {
    return Buffer.from(randomBytes(length)).toString('hex')
  }
}

import cors from 'cors';
import express, { json } from 'express';
import { randomBytes } from 'node:crypto';
import open from 'open';

import { config } from '../config.js';
import HttpRouteHandler from '../connect/http-route-handler.js';
import { WsServerManager } from '../connect/server.js';
import { defaultWsHandler } from '../connect/ws-route-handler.js';

export class ConnectOrchestrator {
  static async run() {
    const connectionSecret = ConnectOrchestrator.tokenGenerate()
    const app = express();
    
    app.use(cors({ origin: config.corsAllowedOrigins }))
    app.use(json())
    app.use(HttpRouteHandler);
    
    const server = app.listen(config.connectServerPort, () => {
      open(`http://localhost:3000/connection/success?code=${connectionSecret}`)
      console.log(`Open browser window to store code.

If unsuccessful manually enter the code:
${connectionSecret}`)
    });

    const wsManager = WsServerManager.init(server, connectionSecret)
      .setDefaultHandler(defaultWsHandler)
  }

  private static tokenGenerate(bytes = 4): string {
    return Buffer.from(randomBytes(bytes)).toString('hex')
  }
}

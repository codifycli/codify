import { Config } from '@oclif/core';
import cors from 'cors';
import express, { json } from 'express';
import { randomBytes } from 'node:crypto';
import open from 'open';

import { config } from '../config.js';
import router from '../connect/http-routes/router.js';
import { SocketServer } from '../connect/socket-server.js';

export class ConnectOrchestrator {
  static rootCommand: string;

  static async run(oclifConfig: Config) {
    this.rootCommand = oclifConfig.options.root;
    
    const connectionSecret = ConnectOrchestrator.tokenGenerate()
    const app = express();
    
    app.use(cors({ origin: config.corsAllowedOrigins }))
    app.use(json())
    app.use(router);
    
    const server = app.listen(config.connectServerPort, (error) => {
      if (error) {
        if (error.message.includes('EADDRINUSE')) {
          console.error('An instance of \'codify connect\' is already running.\n\nExiting...')
          return;
        }

        throw error;
      }

      open(`http://localhost:3000/connection/success?code=${connectionSecret}`)
      console.log(`Open browser window to store code.

If unsuccessful manually enter the code:
${connectionSecret}`)
    });

    // const wsManager = WsServerManager.init(server, connectionSecret)
    //   .setDefault(defaultWsHandler)

    SocketServer.init(server, connectionSecret);
  }

  private static tokenGenerate(bytes = 4): string {
    return Buffer.from(randomBytes(bytes)).toString('hex')
  }
}

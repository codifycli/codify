import { Config } from '@oclif/core';
import cors from 'cors';
import express, { json } from 'express';
import { randomBytes } from 'node:crypto';
import open from 'open';

import { config } from '../config.js';
import router from '../connect/http-routes/router.js';
import { LoginHelper } from '../connect/login-helper.js';
import { SocketServer } from '../connect/socket-server.js';
import { LoginOrchestrator } from './login.js';

export class ConnectOrchestrator {
  static rootCommand: string;

  static async run(oclifConfig: Config, openBrowser = true, onOpen?: (connectionCode: string) => void) {
    const login = LoginHelper.get()?.isLoggedIn;
    if (!login) {
      await LoginOrchestrator.run();
      await LoginHelper.load();
    }

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

      if (openBrowser) {
        open(`${config.dashboardUrl}/connection/success?code=${connectionSecret}`)
        console.log(`Open browser window to store code.

If unsuccessful manually enter the code:
${connectionSecret}`)
      }

      onOpen?.(connectionSecret);
    });

    SocketServer.init(server, connectionSecret);
  }

  private static tokenGenerate(bytes = 4): string {
    return Buffer.from(randomBytes(bytes)).toString('hex')
  }
}

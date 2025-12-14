import { Config } from '@oclif/core';
import cors from 'cors';
import express, { json } from 'express';
// @ts-ignore
import killPort from 'kill-port';
import { randomBytes } from 'node:crypto';
import { Server } from 'node:http';
import open from 'open';

import { config } from '../config.js';
import router from '../connect/http-routes/router.js';
import { LoginHelper } from '../connect/login-helper.js';
import { SocketServer } from '../connect/socket-server.js';
import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { LoginOrchestrator } from './login.js';
import { registerKillListeners } from '../utils/register-kill-listeners.js';

export class ConnectOrchestrator {
  static rootCommand: string;
  static nodeBinary: string;

  static async run(rootCommand: string, reporter: Reporter, openBrowser = true, onOpen?: (connectionCode: string, server: Server) => void) {
    const login = LoginHelper.get()?.isLoggedIn;
    if (!login) {
      ctx.log('User is not logged in. Attempting to log in...')
      await LoginOrchestrator.run();
    }

    this.rootCommand = rootCommand;
    this.nodeBinary = process.execPath;
    
    const connectionSecret = ConnectOrchestrator.tokenGenerate()
    const app = express();

    app.use(cors({ origin: config.corsAllowedOrigins }))
    app.use(json())
    app.use(router);

    const server = await ConnectOrchestrator.listen(app, reporter, (server) => {
      if (openBrowser) {
        open(`${config.dashboardUrl}/connection/success?code=${connectionSecret}`)
        console.log(`Open browser window to store code.

If unsuccessful manually enter the code:
${connectionSecret}`)
      }

      onOpen?.(connectionSecret, server);
    });

    SocketServer.init(server, connectionSecret);
  }

  private static listen(app: express.Application, reporter: Reporter, onOpen: (server: Server) => void): Promise<Server> {
     return new Promise((resolve) => {
      const server = app.listen(config.connectServerPort, async (error) => {
        if (error) {
          if (error.message.includes('EADDRINUSE')) {
            const ifTerminate = await reporter.promptConfirmation('An instance of \'codify connect\' is already running. Do you want to terminate the existing instance and continue?');

            if (!ifTerminate) {
              console.error('\n\nExiting...')
              process.exit(1);
            }

            ctx.processStarted(ProcessName.TERMINATE)
            await reporter.displayProgress();
            await killPort(config.connectServerPort);
            ctx.processFinished(ProcessName.TERMINATE);
            await reporter.hide();

            setTimeout(() => {
              ctx.log('Retrying connection...')
              ConnectOrchestrator.listen(app, reporter, onOpen).then((server) => resolve(server));
            }, 300);

          }
        } else {
          resolve(server);
          onOpen(server);
        }
      });

      registerKillListeners(() => server.close());
    });
  }

  private static tokenGenerate(bytes = 4): string {
    return Buffer.from(randomBytes(bytes)).toString('hex')
  }
}

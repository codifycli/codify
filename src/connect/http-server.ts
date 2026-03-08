import cors from 'cors';
import express, { json } from 'express';
// @ts-ignore
import killPort from 'kill-port'
import { Server } from 'node:http';
import open from 'open';

import { config } from '../config.js';
import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { registerKillListeners } from '../utils/register-kill-listeners.js';
import router from './http-routes/router.js';

export async function createHttpServer(
  connectionSecret: string,
  reporter: Reporter,
  openBrowser = true,
  onOpen?: (connectionCode: string, server: Server) => void
): Promise<Server> {
  const app = express();

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Private-Network', 'true');
    next();
  });
  app.use(cors({ origin: config.corsAllowedOrigins }))
  app.use(json())
  app.use(createAuthHandler(connectionSecret))
  app.use(router);
  app.use(errorHandler)
  
  return listen(app, reporter, (server) => {
    if (openBrowser) {
      open(`${config.dashboardUrl}/connection/success?code=${connectionSecret}`)
      console.log(`Open browser window to store code.

If unsuccessful manually enter the code:
${connectionSecret}`)
    }

    onOpen?.(connectionSecret, server);
  });
  
}

function listen(app: express.Application, reporter: Reporter, onOpen: (server: Server) => void): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(config.connectServerPort, async (error) => {
      if (error) {

        // This whole below allows the user to terminate the existing instance and continue
        // Use kill-port to terminate the existing instance
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
            listen(app, reporter, onOpen).then((server) => resolve(server));
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

function createAuthHandler(connectionCode: string) {
  return (req: any, res: any, next: any) => {
    if (req.header('Authorization') !== connectionCode) {
      return res.status(400).json({ error: 'Invalid authorization' })
    }

    next();
  }
}

function errorHandler(err: Error, req: any, res: any, next: any) {
  console.log(err.message);
  res.status(500).json({ error: err.message });
}

import { Server } from 'node:http';

import { config } from '../config.js';
import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { killPort } from '../utils/kill-port.js';
import open from '../utils/open.js';
import { registerKillListeners } from '../utils/register-kill-listeners.js';
import { Middleware, createHttpApp, listen } from './http-app.js';
import router from './http-routes/router.js';

export async function createHttpServer(
  connectionSecret: string,
  reporter: Reporter,
  openBrowser = true,
  onOpen?: (connectionCode: string, server: Server) => void
): Promise<Server> {
  const server = createHttpApp(router, {
    corsOrigins: config.corsAllowedOrigins,
    middleware: [createAuthHandler(connectionSecret)],
    onError: (error) => console.log(error.message),
  });

  registerKillListeners(() => server.close());
  await listenOrTakeOver(server, reporter);

  if (openBrowser) {
    open(`${config.dashboardUrl}/connection/success?code=${connectionSecret}`)
    console.log(`Open browser window to store code.

If unsuccessful manually enter the code:
${connectionSecret}`)
  }

  onOpen?.(connectionSecret, server);
  return server;
}

async function listenOrTakeOver(server: Server, reporter: Reporter): Promise<void> {
  try {
    await listen(server, config.connectServerPort);
  } catch (error) {
    // Allows the user to terminate the existing instance and continue
    if (!(error as Error).message.includes('EADDRINUSE')) {
      throw error;
    }

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

    await new Promise((resolve) => setTimeout(resolve, 300));
    ctx.log('Retrying connection...')
    await listenOrTakeOver(server, reporter);
  }
}

function createAuthHandler(connectionCode: string): Middleware {
  return (req, res) => {
    if (req.header('Authorization') !== connectionCode) {
      res.status(400).json({ error: 'Invalid authorization' })
      return false;
    }

    return true;
  }
}

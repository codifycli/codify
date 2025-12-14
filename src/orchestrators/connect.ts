import { randomBytes } from 'node:crypto';
import { Server } from 'node:http';

import { createHttpServer } from '../connect/http-server.js';
import { LoginHelper } from '../connect/login-helper.js';
import { SocketServer } from '../connect/socket-server.js';
import { ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { LoginOrchestrator } from './login.js';

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

    const server = await createHttpServer(connectionSecret, reporter, openBrowser, onOpen);
    SocketServer.init(server, connectionSecret);
  }


  private static tokenGenerate(bytes = 4): string {
    return Buffer.from(randomBytes(bytes)).toString('hex')
  }
}

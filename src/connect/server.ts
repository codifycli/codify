import { IncomingMessage, Server, createServer } from 'node:http';
import { Duplex } from 'node:stream';
import { v4 as uuid } from 'uuid';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from '../config.js';

let instance: WsServerManager | undefined;

export class WsServerManager {

  server: Server;
  port?: number;

  private wsServerMap = new Map<string, WebSocketServer>();
  private handlerMap = new Map<string, (ws: WebSocket, manager: WsServerManager, request: IncomingMessage) => void>();

  private connectionSecret;

  static init(server: Server, connectionSecret?: string): WsServerManager {
    instance = new WsServerManager(server, connectionSecret);
    return instance;
  }

  static get(): WsServerManager {
    if (!instance) {
      throw new Error('You must call WsServerManager.init before using it');
    }

    return instance;
  }

  private constructor(server: Server, connectionSecret?: string) {
    this.server = server
    this.connectionSecret = connectionSecret;
    this.wsServerMap.set('default', this.createWssServer());

    this.server.on('upgrade', this.onUpgrade)
  }

  setDefaultHandler(handler: (ws: WebSocket, manager: WsServerManager) => void): WsServerManager {
    const wss = this.createWssServer();
    this.wsServerMap.set('default', wss);
    this.handlerMap.set('default', handler);

    return this;
  }

  addAdhocWsServer(sessionId: string, handler: (ws: WebSocket, manager: WsServerManager) => void) {
    this.wsServerMap.set(sessionId, this.createWssServer());
    this.handlerMap.set(sessionId, handler);
  }

  private onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const { pathname } = new URL(request.url!, 'ws://localhost:51040')

    if (!this.validateOrigin(request.headers.origin!)
       || this.validateConnectionSecret(request)) {
      console.error('Unauthorized request from', request.headers.origin);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy();
      return;
    }

    if (pathname === '/ws' && this.handlerMap.has('default')) {
      const wss = this.wsServerMap.get('default');
      wss?.handleUpgrade(request, socket, head, (ws, request) => this.handlerMap.get('default')!(ws, this, request));
      return;
    }

    const pathSections = pathname.split('/').filter(Boolean);
    if (
      pathSections[0] === 'ws'
      && pathSections[1] === 'session'
      && pathSections[2]
      && this.handlerMap.has(pathSections[2])
    ) {
      const sessionId = pathSections[2];
      console.log('session found, upgrading', sessionId);

      const wss = this.wsServerMap.get(sessionId)!;

      wss.handleUpgrade(request, socket, head, (ws, request) => this.handlerMap.get(sessionId)!(ws, this, request));
    }
  }

  private validateOrigin = (origin: string): boolean =>
    config.corsAllowedOrigins.includes(origin)

  private validateConnectionSecret = (request: IncomingMessage): boolean => {
    const connectionSecret = request.headers['connection-secret'] as string;
    return connectionSecret === this.connectionSecret;
  }

  private createWssServer(): WebSocketServer {
    return new WebSocketServer({
      noServer: true,
    })
  }
}

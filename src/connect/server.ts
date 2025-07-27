import { IncomingMessage, Server, createServer } from 'node:http';
import { v4 as uuid } from 'uuid';
import { WebSocket, WebSocketServer } from 'ws';

const DEFAULT_PORT = 51_040;

export class WsServerManager {

  server: Server;
  port?: number;

  private wsServerMap = new Map<string, WebSocketServer>();
  private handlerMap = new Map<string, (ws: WebSocket, manager: WsServerManager, request: IncomingMessage) => void>();

  private connectionSecret;

  constructor(connectionSecret?: string) {
    this.server = createServer();
    this.connectionSecret = connectionSecret;
    this.wsServerMap.set('default', this.createWssServer());

    this.initServer();
  }

  listen(cb?: () => void, port?: number, ) {
    this.port = port ?? DEFAULT_PORT
    this.server.listen(this.port, 'localhost', cb);
  }
  
  setDefaultHandler(handler: (ws: WebSocket, manager: WsServerManager) => void): WsServerManager {
    const wss = this.createWssServer();
    this.wsServerMap.set('default', wss);
    this.handlerMap.set('default', handler);

    return this;
  }

  addAdditionalHandlers(path: string, handler: (ws: WebSocket) => void): WsServerManager {
    this.handlerMap.set(path, () => {
      const wss = this.addWebsocketServer();

    });

    return this;
  }

  startAdhocWsServer(sessionId: string, handler: (ws: WebSocket, manager: WsServerManager) => void) {
    this.wsServerMap.set(sessionId, this.createWssServer());
    this.handlerMap.set(sessionId, handler);
  }

  private addWebsocketServer(): string {
    const key = uuid();

    const wss = new WebSocketServer({
      noServer: true
    })
    this.wsServerMap.set(key, wss);

    wss.on('close', () => {
      this.wsServerMap.delete(key);
    })

    return key;
  }

  private initServer() {
    this.server.on('upgrade', (request, socket, head) => {
      console.log('upgrade')

      const { pathname } = new URL(request.url!, 'ws://localhost:51040')
      console.log('Pathname:', pathname)

      const code = request.headers['sec-websocket-protocol']
      if (this.connectionSecret && code !== this.connectionSecret) {
        console.log('Auth failed');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return;
      }

      if (pathname === '/' && this.handlerMap.has('default')) {
        const wss = this.wsServerMap.get('default');
        wss?.handleUpgrade(request, socket, head, (ws, request) => this.handlerMap.get('default')!(ws, this, request));
        return;
      }

      const pathSections = pathname.split('/').filter(Boolean);
      console.log(pathSections);
      console.log('available sessions', this.handlerMap)

      if (pathSections[0] === 'session'
        && pathSections[1]
        && this.handlerMap.has(pathSections[1])
      ) {
        const sessionId = pathSections[1];
        console.log('session found, upgrading', sessionId);

        const wss = this.wsServerMap.get(sessionId)!;

        wss.handleUpgrade(request, socket, head, (ws, request) => this.handlerMap.get(sessionId)!(ws, this, request));
        return;
      }
    })
  }

  private createWssServer(): WebSocketServer {
    return new WebSocketServer({
      noServer: true,
    })
  }
}

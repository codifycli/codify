import { IPty } from '@homebridge/node-pty-prebuilt-multiarch';
import { Server as HttpServer, IncomingMessage } from 'node:http';
import { Duplex } from 'node:stream';
import { v4 as uuid } from 'uuid';
import WebSocket, { WebSocketServer } from 'ws';

import { config } from '../config.js';

export interface Session {
  server: WebSocketServer;
  clientId: string;
  ws?: WebSocket;
  pty?: IPty;
  additionalData: Record<string, unknown>;
}

let instance: SocketServer | undefined;

/**
 * Main socket server. Experimented with SocketIO but it does not work!!. xterm.js does not natively support
 * websckets and the arraybuffer is mangled when trying my own implementaiton. SocketIO also does not play nice
 * when used side by side with ws.
 */
export class SocketServer {

  private server: HttpServer;
  private connectionSecret: string;
  private mainConnections = new Map<string, WebSocket>(); // These are per webpage
  private sessions = new Map<string, Session>();

  static init(server: HttpServer, connectionSecret: string): SocketServer {
    instance = new SocketServer(server, connectionSecret);
    return instance;
  }

  static get(): SocketServer {
    if (!instance) {
      throw new Error('You must call WsServerManager.init before using it');
    }

    return instance;
  }

  private constructor(server: HttpServer, connectionSecret: string) {
    this.server = server;
    this.connectionSecret = connectionSecret;

    this.server.on('upgrade', this.onUpgrade);
  }

  getMainConnection(id: string): WebSocket | undefined {
    return this.mainConnections.get(id);
  }

  createSession(clientId: string): string {
    const sessionId = uuid();

    this.sessions.set(
      sessionId,
      { server: this.createWssServer(), clientId, additionalData: {} }
    )

    return sessionId;
  }

  removeSession(id: string) {
    this.sessions.delete(id);
  }

  // Under normal use, there should only be 1 socket (1 connection) per namespace.
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  private onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const { pathname } = new URL(request.url!, 'ws://localhost:51040')

    // Ignore all socket io so it does not interfere
    if (pathname.includes('socket.io')) {
      return;
    }

    if (/*! this.validateOrigin(request.headers.origin ?? request.headers.referer ?? '') || */ !this.validateConnectionSecret(request)) {
      console.error('Unauthorized request. Connection code:', request.headers['sec-websocket-protocol']);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy();
      return;
    }

    if (pathname === '/ws') {
      console.log('Client connected!')
      const wss = this.createWssServer();
      wss.handleUpgrade(request, socket, head, this.handleClientConnected);
    }

    const pathSections = pathname.split('/').filter(Boolean);
    if (
      pathSections[0] === 'ws'
      && pathSections[1] === 'session'
      && pathSections[2]
      && this.sessions.has(pathSections[2])
    ) {
      const sessionId = pathSections[2];
      console.log('Session found, upgrading', sessionId);

      const session = this.sessions.get(sessionId);
      if (!session) {
        return;
      }

      const wss = session.server;
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        console.log('New ws session!', sessionId)
        this.sessions.get(sessionId)!.ws = ws;
      });

      wss.on('close', () => {
        console.log('Session closed');
        this.sessions.delete(sessionId);
      })
    }
  }

  private handleClientConnected = (ws: WebSocket) => {
    const clientId = uuid();
    this.mainConnections.set(clientId, ws);
    ws.send(JSON.stringify({ key: 'opened', data: { clientId: uuid } }))

    ws.on('close', () => {
      this.mainConnections.delete(clientId);
    })
  }

  private validateOrigin = (origin: string): boolean =>
    config.corsAllowedOrigins.includes(origin)

  private validateConnectionSecret = (request: IncomingMessage): boolean => {
    const connectionSecret = request.headers['sec-websocket-protocol'] as string;
    return connectionSecret === this.connectionSecret;
  }

  private createWssServer(): WebSocketServer {
    return new WebSocketServer({
      noServer: true,
    })
  }

}

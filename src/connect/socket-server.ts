import { IPty } from '@homebridge/node-pty-prebuilt-multiarch';
import * as fs from 'node:fs/promises';
import { Server as HttpServer, IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
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
  private startTimestamp = new Date();
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

    if (!this.validateConnectionSecret(request)) {
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
    ws.send(JSON.stringify({ key: 'opened', data: { clientId, startTimestamp: this.startTimestamp.toISOString() } }));

    ws.on('message', async (message) => {
      const data = JSON.parse(message.toString('utf8'));

      if (data.key === 'terminate') {
        process.exit(0);
        return;
      }

      if (data.key === 'update-config') {
        await this.handleConfigUpdate(ws, data);
        return;
      }
   });

    ws.on('close', () => {
      this.mainConnections.delete(clientId);
    })
  }

  private async handleConfigUpdate(ws: WebSocket, data: { sessionId: string; config: string }) {
    try {
      const { sessionId, config: configContent } = data;

      if (!sessionId || !configContent) {
        ws.send(JSON.stringify({
          key: 'update-config-response',
          success: false,
          sessionId,
          error: 'Missing sessionId or config'
        }));
        return;
      }

      const session = this.sessions.get(sessionId);
      if (!session) {
        ws.send(JSON.stringify({
          key: 'update-config-response',
          success: false,
          sessionId,
          error: 'Session not found'
        }));
        return;
      }

      const filePath = session.additionalData.filePath as string | undefined;
      if (!filePath) {
        ws.send(JSON.stringify({
          key: 'update-config-response',
          success: false,
          sessionId,
          error: 'File path not found in session'
        }));
        return;
      }

      // Security: Ensure file path is in temp directory
      const tmpDir = os.tmpdir();
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(tmpDir)) {
        console.error('Security: Attempted to write outside temp directory', filePath);
        ws.send(JSON.stringify({
          key: 'update-config-response',
          success: false,
          sessionId,
          error: 'Invalid file path'
        }));
        return;
      }

      await fs.writeFile(filePath, configContent, 'utf8');

      ws.send(JSON.stringify({
        key: 'update-config-response',
        success: true,
        sessionId
      }));
    } catch (error) {
      console.error('Error updating config:', error);
      ws.send(JSON.stringify({
        key: 'update-config-response',
        success: false,
        sessionId: data.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
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

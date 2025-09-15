import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import {config} from "../config.js";

let instance: SocketServer | undefined;

export class SocketServer {

  private server: HttpServer;
  private connectionSecret: string;
  private io: Server

  private handlers: Array<(io: Server, socket: Socket) => void> = [];

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
    this.io = new Server(server, {
      cors: {
        origin: config.corsAllowedOrigins
      }
    });
a    this.io.on('connection', (socket) => {
      // Only allow clients with secret to connect
      if (socket.handshake.auth.token !== connectionSecret) {
        console.log(`Invalid auth on connection`)
        socket.disconnect();
      }

      this.handlers.forEach(handler => handler(this.io, socket));
    });
  }

  // These are connection handlers on the default 'ws://url.com/'
  registerHandler(handler: (io: Server, socket: Socket) => void): void {
    this.handlers.push(handler);
  }

  addSession(id: string, handler?: (io: Server, socket: Socket) => void): void {
    this.io.of(`/ws/session/${id}`).on('connection', (socket) => {
      console.log(`Session ${id} connected!!`);
      handler?.(this.io, socket);
    })
  }

  // Under normal use, there should only be 1 socket (1 connection) per namespace.
  getSession(id: string): Socket | undefined {
    const sockets = [...this.io.of(`/ws/session/${id}`).sockets.values()];
    if (sockets.length === 0) {
      return undefined;
    }

    return sockets[0];
  }

}
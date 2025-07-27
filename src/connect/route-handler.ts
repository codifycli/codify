import { WebSocket } from 'ws';

import { connectApplyInitHandler } from './apply.js';
import { WsServerManager } from './server.js';

export async function defaultWsHandler(ws: WebSocket, manager: WsServerManager) {
  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message.toString('utf8'));
      console.log(msg);
    } catch (error) {
      console.error(error);
      return;
    }

    const { cmd } = msg;
    if (!cmd) {
      console.error('No cmd found');
      return;
    }

    switch (cmd) {
      case 'apply_init': {
        connectApplyInitHandler(msg, ws, manager);
        break;
      }
    }

  })
}



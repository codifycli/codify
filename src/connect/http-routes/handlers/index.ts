import { Router } from '../../http-app.js';

import { VERSION } from '../../../config.js';
import { SocketServer } from '../../socket-server.js';

const router = new Router();

router.post('/session', (req, res) => {
  const { clientId } = req.body;
  if (!clientId) {
    throw new Error('clientId is required');
  }

  const socketServer = SocketServer.get();
  if (!socketServer.getMainConnection(clientId)) {
    throw new Error('Invalid connection id');
  }

  const sessionId = socketServer.createSession(clientId);
  return res.status(200).json({ sessionId });
})

/**
 * What this version of the CLI supports. The dashboard uses it to decide how to send commands. Ex: `variables`: the
 * dashboard sends the raw config and the values of its variables ("variables" in the request body) instead of replacing
 * ${{ }} references itself.
 */
export const CAPABILITIES = {
  variables: true,
};

router.get('/capabilities', (_req, res) => res.status(200).json({ version: VERSION, ...CAPABILITIES }));

export default router;

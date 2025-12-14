import { Router } from 'express';

import { SocketServer } from '../../socket-server.js';

const router = Router({
  mergeParams: true,
});

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

export default router;

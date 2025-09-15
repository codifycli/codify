import { Router } from 'express';
import { v4 as uuid } from 'uuid';

import { SocketServer } from '../../socket-server.js';

const router = Router({
  mergeParams: true,
});

router.post('/session', (req, res) => {
  const sessionId = uuid();
  const socketServer = SocketServer.get();

  socketServer.addSession(sessionId);
  console.log('Terminal session created!', sessionId)

  return res.status(200).json({ sessionId });
})

export default router;
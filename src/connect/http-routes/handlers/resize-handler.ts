import { Router } from 'express';
import { SocketServer } from '../../socket-server.js';

export function resizeHandler(): Router {
  const router = Router({ mergeParams: true });

  router.post('/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { cols, rows } = req.body;

    if (!cols || !rows) {
      return res.status(400).json({ error: 'cols and rows required' });
    }

    const manager = SocketServer.get();
    const session = manager.getSession(sessionId);

    if (!session) {
      return res.status(400).json({ error: 'SessionId does not exist' });
    }

    if (!session.pty) {
      return res.status(304).json({ status: 'PTY not yet started' });
    }

    session.pty.resize(cols, rows);

    return res.status(204).json({});
  });

  return router;
}

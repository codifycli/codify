import { Router } from 'express';

import { ConnectCommand, createCommandHandler } from './handlers/create-command.js';
import defaultHandler from './handlers/index.js';
import { terminalHandler } from './handlers/terminal-handler.js';
import { applyHandler } from './handlers/apply-handler.js';
import { planHandler } from './handlers/plan-handler.js';

const router = Router();

router.use('/', defaultHandler);
router.use('/apply', applyHandler());
router.use('/plan', planHandler())
// router.use('/import', createCommandHandler(ConnectCommand.IMPORT));
router.use('/terminal', terminalHandler());

export default router;

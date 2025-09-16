import { Router } from 'express';

import { ConnectCommand, createCommandHandler } from './handlers/create-command.js';
import defaultHandler from './handlers/index.js';

const router = Router();

router.use('/', defaultHandler);
router.use('/apply', createCommandHandler(ConnectCommand.APPLY));
router.use('/plan', createCommandHandler(ConnectCommand.PLAN))
router.use('/import', createCommandHandler(ConnectCommand.IMPORT));
router.use('/terminal', createCommandHandler(ConnectCommand.TERMINAL));

export default router;
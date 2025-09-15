import { Router } from 'express';

import { createCommandHandler } from './handlers/create-command.js';
import defaultHandler from './handlers/index.js';

const router = Router();

router.use('/', defaultHandler);
router.use('/apply', createCommandHandler('apply'));
router.use('/plan', createCommandHandler('plan'));
router.use('/import', createCommandHandler('import'));

export default router;
import { Router } from 'express';

import { applyHandler } from './handlers/apply-handler.js';
import { importHandler } from './handlers/import-handler.js';
import defaultHandler from './handlers/index.js';
import { planHandler } from './handlers/plan-handler.js';
import { refreshHandler } from './handlers/refresh-handler.js';
import { terminalHandler } from './handlers/terminal-handler.js';

const router = Router();

router.use('/', defaultHandler);
router.use('/apply', applyHandler());
router.use('/plan', planHandler())
router.use('/import', importHandler());
router.use('/refresh', refreshHandler());
router.use('/terminal', terminalHandler());

export default router;

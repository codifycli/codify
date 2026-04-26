import { Router } from 'express';

import { applyHandler } from './handlers/apply-handler.js';
import { importHandler } from './handlers/import-handler.js';
import defaultHandler from './handlers/index.js';
import { initHandler } from './handlers/init-handler.js';
import { planHandler } from './handlers/plan-handler.js';
import { refreshHandler } from './handlers/refresh-handler.js';
import { resizeHandler } from './handlers/resize-handler.js';
import { terminalHandler } from './handlers/terminal-handler.js';
import { testHandler } from './handlers/test-handler.js';

const router = Router();

router.use('/', defaultHandler);
router.use('/apply', applyHandler());
router.use('/plan', planHandler())
router.use('/import', importHandler());
router.use('/refresh', refreshHandler());
router.use('/resize', resizeHandler());
router.use('/terminal', terminalHandler());
router.use('/init', initHandler());
router.use('/test', testHandler());


export default router;

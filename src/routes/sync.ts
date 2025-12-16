import { Router } from 'express';
import { syncAccount, syncValidators } from '../controllers/sync.controller';

const router = Router();

// POST /api/accounts/:accountId/sync - Sync trades for an account
router.post('/:accountId/sync', syncValidators.syncAccount, syncAccount);

export default router;

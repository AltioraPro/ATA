import { Router } from 'express';
import {
  connectAccount,
  getAccount,
  listAccounts,
  listMetaApiAccounts,
  getServers,
  getAccountTrades,
  undeployAccount,
  deleteAccount,
  accountValidators,
} from '../controllers/account.controller';

const router = Router();

// GET /api/accounts/servers - Get available servers for a broker
router.get('/servers', getServers);

// POST /api/accounts/connect - Connect a new MetaTrader account
router.post('/connect', accountValidators.connectAccount, connectAccount);

// GET /api/accounts - List user accounts
router.get('/', listAccounts);

// GET /api/accounts/metaapi - List all accounts from MetaAPI cloud
router.get('/metaapi', listMetaApiAccounts);

// GET /api/accounts/:accountId - Get account details
router.get('/:accountId', getAccount);

// GET /api/accounts/:accountId/trades - Get account trades
router.get('/:accountId/trades', getAccountTrades);

// POST /api/accounts/:accountId/undeploy - Undeploy account (stop billing)
router.post('/:accountId/undeploy', undeployAccount);

// DELETE /api/accounts/:accountId - Delete account from MetaAPI
router.delete('/:accountId', deleteAccount);

export default router;

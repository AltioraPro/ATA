import { Request, Response } from "express";
import { createId } from "@paralleldrive/cuid2";
import { asyncHandler, logger } from "../middleware/errorHandler";
import { validateParams } from "../middleware/validation";
import { z } from "zod";
import { decryptPassword } from "../utils/encryption";
import { metaApiService } from "../services/metaapi.service";
import { databaseService } from "../services/database.service";
import { SyncAccountResponse, ApiSuccess, ApiFailure } from "../types/api";

const syncAccountParamsSchema = z.object({
  accountId: z.string(),
});

// Sync account trades using the "Snapshot Pattern"
export const syncAccount = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.params;

  // Create sync log entry
  const syncLogId = createId();
  const startedAt = new Date();

  await databaseService.createSyncLog({
    id: syncLogId,
    accountId,
    status: "pending",
    tradesFetched: 0,
    tradesInserted: 0,
    startedAt,
  });

  try {
    // Get account details
    const account = await databaseService.getAccount(accountId);
    if (!account) {
      await databaseService.updateSyncLog(syncLogId, {
        status: "error",
        errorMessage: "Account not found",
        completedAt: new Date(),
      });

      const response: ApiFailure = {
        success: false,
        error: {
          error: "ACCOUNT_NOT_FOUND",
          message: "Account not found",
        },
      };
      return res.status(404).json(response);
    }

    if (!account.isActive) {
      await databaseService.updateSyncLog(syncLogId, {
        status: "error",
        errorMessage: "Account is inactive",
        completedAt: new Date(),
      });

      const response: ApiFailure = {
        success: false,
        error: {
          error: "ACCOUNT_INACTIVE",
          message: "Account is inactive",
        },
      };
      return res.status(400).json(response);
    }

    // Check for full sync parameter
    const { fullSync } = req.query;
    const forceFullSync = fullSync === "true";

    // Perform the snapshot sync (deploy -> sync -> fetch -> undeploy)
    const { trades } = await metaApiService.syncAccountTrades(
      accountId,
      forceFullSync ? null : account.lastSyncTime || undefined
    );

    // Update sync log with fetched count
    await databaseService.updateSyncLog(syncLogId, {
      tradesFetched: trades.length,
    });

    // Batch insert/update trades
    const insertedCount = await databaseService.upsertTrades(accountId, trades);

    // Update last sync time
    const now = new Date();
    await databaseService.updateLastSyncTime(accountId, now);

    // Complete sync log
    await databaseService.updateSyncLog(syncLogId, {
      status: "success",
      tradesInserted: insertedCount,
      completedAt: now,
    });

    const response: ApiSuccess<SyncAccountResponse> = {
      success: true,
      data: {
        accountId,
        tradesFetched: trades.length,
        tradesInserted: insertedCount,
        syncLogId,
        message: `Successfully synced ${insertedCount} trades`,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error("Sync failed", {
      accountId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Update sync log with error
    await databaseService.updateSyncLog(syncLogId, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      completedAt: new Date(),
    });

    const response: ApiFailure = {
      success: false,
      error: {
        error: "SYNC_FAILED",
        message: "Failed to sync account trades",
        details: error instanceof Error ? error.message : undefined,
      },
    };

    res.status(500).json(response);
  }
});

export const syncValidators = {
  syncAccount: validateParams(syncAccountParamsSchema),
};

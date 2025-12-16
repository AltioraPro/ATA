import { db } from "../database/index";
import { mtAccounts, mtTrades, syncLogs } from "../database/schema/accounts";
import { MetaApiTrade } from "../types/api";
import { eq, and, gte } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { logger } from "../middleware/errorHandler";

export class DatabaseService {
  /**
   * Creates a new MetaTrader account record
   */
  async createAccount(data: {
    id: string;
    userId: string;
    platform: "mt4" | "mt5";
    login: string;
    encryptedPassword: string;
    server: string;
    metaApiAccountId: string;
  }) {
    const account = {
      id: data.id,
      userId: data.userId,
      platform: data.platform,
      login: data.login,
      encryptedPassword: data.encryptedPassword,
      server: data.server,
      metaApiAccountId: data.metaApiAccountId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(mtAccounts).values(account);
    return account;
  }

  /**
   * Gets an account by ID
   */
  async getAccount(accountId: string) {
    const result = await db
      .select()
      .from(mtAccounts)
      .where(eq(mtAccounts.id, accountId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Updates the last sync time for an account
   */
  async updateLastSyncTime(accountId: string, lastSyncTime: Date) {
    await db
      .update(mtAccounts)
      .set({
        lastSyncTime,
        updatedAt: new Date(),
      })
      .where(eq(mtAccounts.id, accountId));
  }

  /**
   * Deletes an account and all its related data
   */
  async deleteAccount(accountId: string): Promise<void> {
    // Delete trades first (foreign key constraint)
    await db.delete(mtTrades).where(eq(mtTrades.accountId, accountId));
    
    // Delete sync logs
    await db.delete(syncLogs).where(eq(syncLogs.accountId, accountId));
    
    // Delete the account
    await db.delete(mtAccounts).where(eq(mtAccounts.id, accountId));
    
    logger.info("Account deleted from database", { accountId });
  }

  /**
   * Batch upsert trades (insert or update if exists)
   */
  async upsertTrades(
    accountId: string,
    trades: MetaApiTrade[]
  ): Promise<number> {
    if (trades.length === 0) return 0;

    const tradeRecords = trades.map((trade) => ({
      id: createId(),
      accountId,
      ticket: trade.ticket,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      profit: trade.profit,
      commission: trade.commission,
      swap: trade.swap,
      openTime: trade.openTime,
      closeTime: trade.closeTime,
      magic: trade.magic,
      comment: trade.comment,
      syncedAt: new Date(),
      createdAt: new Date(),
    }));

    // Use upsert to handle duplicates based on accountId + ticket
    let insertedCount = 0;

    for (const trade of tradeRecords) {
      try {
        await db
          .insert(mtTrades)
          .values(trade)
          .onConflictDoUpdate({
            target: [mtTrades.accountId, mtTrades.ticket],
            set: {
              symbol: trade.symbol,
              side: trade.side,
              quantity: trade.quantity,
              price: trade.price,
              profit: trade.profit,
              commission: trade.commission,
              swap: trade.swap,
              openTime: trade.openTime,
              closeTime: trade.closeTime,
              magic: trade.magic,
              comment: trade.comment,
              syncedAt: new Date(),
            },
          });
        insertedCount++;
      } catch (error) {
        logger.warn("Failed to upsert trade", {
          ticket: trade.ticket,
          accountId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return insertedCount;
  }

  /**
   * Creates a sync log entry
   */
  async createSyncLog(data: {
    id: string;
    accountId: string;
    status: "success" | "error" | "partial";
    tradesFetched: number;
    tradesInserted: number;
    errorMessage?: string;
    startedAt: Date;
    completedAt?: Date;
  }) {
    await db.insert(syncLogs).values({
      id: data.id,
      accountId: data.accountId,
      status: data.status,
      tradesFetched: data.tradesFetched.toString(),
      tradesInserted: data.tradesInserted.toString(),
      errorMessage: data.errorMessage,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      createdAt: new Date(),
    });

    return data;
  }

  /**
   * Updates a sync log entry
   */
  async updateSyncLog(
    syncLogId: string,
    updates: {
      status?: "success" | "error" | "partial";
      tradesFetched?: number;
      tradesInserted?: number;
      errorMessage?: string;
      completedAt?: Date;
    }
  ) {
    const updateData: any = {
      ...updates,
    };

    if (updates.tradesFetched !== undefined) {
      updateData.tradesFetched = updates.tradesFetched.toString();
    }

    if (updates.tradesInserted !== undefined) {
      updateData.tradesInserted = updates.tradesInserted.toString();
    }

    await db.update(syncLogs).set(updateData).where(eq(syncLogs.id, syncLogId));
  }

  /**
   * Gets existing trades for an account since last sync
   */
  async getExistingTradeTickets(
    accountId: string,
    since?: Date
  ): Promise<Set<string>> {
    const whereCondition = since
      ? and(eq(mtTrades.accountId, accountId), gte(mtTrades.openTime, since))
      : eq(mtTrades.accountId, accountId);

    const existingTrades = await db
      .select({ ticket: mtTrades.ticket })
      .from(mtTrades)
      .where(whereCondition);

    return new Set(existingTrades.map((t) => t.ticket));
  }
}

export const databaseService = new DatabaseService();

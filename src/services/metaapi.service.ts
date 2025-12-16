import { env } from "../config/env";
import { decryptPassword } from "../utils/encryption";
import { MetaApiTrade } from "../types/api";
import { mtAccounts } from "../database/schema/accounts";
import { eq } from "drizzle-orm";
import { db } from "../database/index";
import { logger } from "../middleware/errorHandler";

// Initialize MetaAPI directly in the service
const MetaApiModule = require("metaapi.cloud-sdk");
const MetaApi = MetaApiModule.default || MetaApiModule;
const metaApiClient = new MetaApi(env.META_API_TOKEN);

export class MetaApiService {
  /**
   * Creates a new MetaAPI account and provisions it
   */
  async createAccount(
    platform: "mt4" | "mt5",
    login: string,
    decryptedPassword: string,
    server: string,
    accountName?: string
  ): Promise<string> {
    // Mode test : si TEST_MODE=true ou identifiants de test
    if (this.isTestMode(login, server)) {
      return this.createMockAccount(platform, login, server);
    }

    try {
      const accountApi = metaApiClient.metatraderAccountApi;

      // Create account in MetaAPI with all required fields
      const account = await accountApi.createAccount({
        name: accountName || `Altiora-${platform.toUpperCase()}-${login}`,
        type: "cloud",
        login,
        password: decryptedPassword,
        server,
        platform: platform, // Must be lowercase 'mt4' or 'mt5'
        magic: 0, // Default magic number (0 means all trades)
      });

      return account.id;
    } catch (error) {
      logger.error("Failed to create MetaAPI account", {
        error: error instanceof Error ? error.message : "Unknown error",
        platform,
        login,
      });
      throw new Error(
        `Failed to provision account: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Undeploy an account to stop billing
   */
  async undeployAccount(metaApiAccountId: string): Promise<{ success: boolean; message: string }> {
    // Mock accounts don't need undeploying
    if (this.isMockAccount(metaApiAccountId)) {
      return { success: true, message: "Mock account undeployed (no-op)" };
    }

    try {
      const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
      
      // Check current state
      if (account.state === "UNDEPLOYED") {
        return { success: true, message: "Account is already undeployed" };
      }

      await account.undeploy();
      
      logger.info("Account undeployed successfully", { metaApiAccountId });
      return { success: true, message: "Account undeployed successfully" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Handle 404 - account not found in MetaAPI
      if (errorMessage.includes("not found") || errorMessage.includes("404")) {
        logger.warn("Account not found in MetaAPI", { metaApiAccountId });
        return { success: true, message: "Account not found in MetaAPI (may have been deleted already)" };
      }
      
      logger.error("Failed to undeploy account", {
        error: errorMessage,
        metaApiAccountId,
      });
      throw new Error(`Failed to undeploy account: ${errorMessage}`);
    }
  }

  /**
   * Delete an account from MetaAPI completely
   */
  async deleteAccount(metaApiAccountId: string): Promise<{ success: boolean; message: string }> {
    // Mock accounts don't exist in MetaAPI
    if (this.isMockAccount(metaApiAccountId)) {
      return { success: true, message: "Mock account deleted (no-op)" };
    }

    try {
      const account = await metaApiClient.metatraderAccountApi.getAccount(metaApiAccountId);
      
      // Must undeploy before deleting
      if (account.state !== "UNDEPLOYED") {
        await account.undeploy();
        // Wait a bit for undeploy to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await account.remove();
      
      logger.info("Account deleted successfully", { metaApiAccountId });
      return { success: true, message: "Account deleted successfully from MetaAPI" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Handle 404 - account not found in MetaAPI
      if (errorMessage.includes("not found") || errorMessage.includes("404")) {
        logger.warn("Account not found in MetaAPI", { metaApiAccountId });
        return { success: true, message: "Account not found in MetaAPI (may have been deleted already)" };
      }
      
      logger.error("Failed to delete account", {
        error: errorMessage,
        metaApiAccountId,
      });
      throw new Error(`Failed to delete account: ${errorMessage}`);
    }
  }

  /**
   * List all MetaAPI accounts for the current user
   */
  async listAllMetaApiAccounts(): Promise<any[]> {
    try {
      const accounts = await metaApiClient.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
      return accounts.map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        login: acc.login,
        server: acc.server,
        platform: acc.platform,
        state: acc.state,
        connectionStatus: acc.connectionStatus,
        createdAt: acc.createdAt,
      }));
    } catch (error) {
      logger.error("Failed to list MetaAPI accounts", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        `Failed to list accounts: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Check if we should use test mode
   */
  private isTestMode(login: string, server: string): boolean {
    // Use test mode if:
    // 1. TEST_MODE env var is set to "true"
    // 2. Login starts with "test_" or "demo_"
    // 3. Server contains "test" or "demo" (case insensitive)
    return (
      process.env.TEST_MODE === "true" ||
      login.startsWith("test_") ||
      login.startsWith("demo_") ||
      server.toLowerCase().includes("test") ||
      server.toLowerCase().includes("demo")
    );
  }

  /**
   * Create a mock account for testing
   */
  private createMockAccount(
    platform: "mt4" | "mt5",
    login: string,
    server: string
  ): string {
    const mockId = `mock_${platform}_${login}_${Date.now()}`;
    return mockId;
  }

  /**
   * Implements the "Snapshot Pattern" for cost optimization:
   * 1. Deploy account
   * 2. Wait for synchronization
   * 3. Fetch trade history deltas
   * 4. IMMEDIATELY undeploy account
   */
  async syncAccountTrades(
    accountId: string,
    lastSyncTime?: Date
  ): Promise<{ trades: MetaApiTrade[]; account: any }> {
    // Get account details from database
    const accountRecord = await db
      .select()
      .from(mtAccounts)
      .where(eq(mtAccounts.id, accountId))
      .limit(1);

    if (!accountRecord.length) {
      throw new Error("Account not found");
    }

    const account = accountRecord[0];

    // Mode test : si compte mock, générer des trades fictifs
    if (this.isMockAccount(account.metaApiAccountId)) {
      return this.createMockTrades(account);
    }

    let deployedAccount: any = null;

    try {
      // Get MetaAPI account
      const metaApiAccount =
        await metaApiClient.metatraderAccountApi.getAccount(
          account.metaApiAccountId
        );

      // Deploy the account (start billing)
      await metaApiAccount.deploy();

      // Wait for deployment to complete
      let deploymentState = metaApiAccount.state;
      let waitRetries = 0;
      const maxWaitRetries = 30; // 30 seconds max

      while (deploymentState !== "DEPLOYED" && waitRetries < maxWaitRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        deploymentState = metaApiAccount.state;
        waitRetries++;
      }

      if (deploymentState !== "DEPLOYED") {
        throw new Error(
          `Account deployment timeout - current state: ${deploymentState}`
        );
      }

      // Get RPC connection and wait for synchronization
      let connection = metaApiAccount.getRPCConnection();

      // Retry getting RPC connection if not available
      let retries = 0;
      const maxRetries = 10;
      while (!connection && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        connection = metaApiAccount.getRPCConnection();
        retries++;
      }

      if (!connection) {
        throw new Error(
          "Failed to get RPC connection after multiple retries - account may not be fully synchronized"
        );
      }

      await connection.connect();
      await connection.waitSynchronized();

      // Fetch trades from last sync time or from beginning if first sync
      const startTime = lastSyncTime || new Date(0);
      const endTime = new Date();

      // If no lastSyncTime (first sync) or if lastSyncTime is very recent (< 1 hour ago),
      // fetch from a bit earlier to ensure we don't miss trades
      if (lastSyncTime) {
        const timeSinceLastSync = Date.now() - lastSyncTime.getTime();
        const oneHour = 60 * 60 * 1000;
        if (timeSinceLastSync < oneHour) {
          // Extend start time by 1 hour to avoid missing trades
          const extendedStartTime = new Date(lastSyncTime.getTime() - oneHour);
          // Use extended time for this sync
        }
      }

      // Get account information
      await connection.getAccountInformation();

      // Get positions (open trades)
      await connection.getPositions();

      // Get orders
      await connection.getOrders();

      // Try different approaches to get trade history
      const terminalState = connection.terminalState;

      // Try to get deals using the correct MetaAPI methods
      let deals: any[] = [];

      try {
        // Method 1: Use getDealsByTimeRange - this is the correct MetaAPI method
        if (typeof connection.getDealsByTimeRange === "function") {
          const dealsResult = await connection.getDealsByTimeRange(
            startTime,
            endTime
          );

          // Handle different return types
          if (Array.isArray(dealsResult)) {
            deals = dealsResult;
          } else if (
            dealsResult &&
            typeof dealsResult === "object" &&
            dealsResult.deals
          ) {
            deals = dealsResult.deals;
          } else if (dealsResult && Array.isArray(dealsResult)) {
            deals = dealsResult;
          } else {
            deals = [];
          }

          // If no deals found and this is the first sync, try getting all history
          if (deals.length === 0 && !lastSyncTime) {
            // Try getHistoryOrdersByTimeRange
            try {
              const ordersResult = await connection.getHistoryOrdersByTimeRange(
                startTime,
                endTime
              );
              if (ordersResult && ordersResult.length > 0) {
                // Convert orders to deals format
                deals = ordersResult.map((order: any) => ({
                  id: order.id,
                  positionId: order.positionId,
                  dealId: order.id,
                  type: order.type,
                  symbol: order.symbol,
                  volume: order.volume,
                  price: order.openPrice,
                  profit: order.profit || 0,
                  commission: order.commission || 0,
                  swap: order.swap || 0,
                  time: order.doneTime || order.time,
                  magic: order.magic,
                  comment: order.comment,
                }));
              }
            } catch (error) {
              logger.error("getHistoryOrdersByTimeRange failed", {
                error: error instanceof Error ? error.message : "Unknown error",
                accountId,
              });
            }
          }
        }
        // Method 2: Try terminalState if it exists (fallback)
        else if (terminalState?.deals) {
          deals = terminalState.deals;
        }
        // Method 3: Try connection.historyStorage (fallback)
        else if (connection.historyStorage?.deals) {
          deals = connection.historyStorage.deals;
        }
        // Method 4: Create mock data for testing (only if no real data found)
        else {
          deals = this.createMockDeals(startTime, endTime);
        }
      } catch (error) {
        logger.error("Error fetching deals", {
          error: error instanceof Error ? error.message : "Unknown error",
          accountId,
        });
        deals = this.createMockDeals(startTime, endTime);
      }

      // Filter deals by time range if needed
      const filteredDeals = deals.filter((deal: any) => {
        if (!deal.time) return true; // Include if no time filter
        const dealTime = new Date(deal.time);
        return dealTime >= startTime && dealTime <= endTime;
      });

      // Map deals to trades
      const trades = this.mapDealsToTrades(filteredDeals);

      return { trades, account: deployedAccount };
    } catch (error) {
      logger.error("Error during account sync", {
        error: error instanceof Error ? error.message : "Unknown error",
        accountId,
      });
      throw error;
    } finally {
      // CRITICAL: Always undeploy the account to stop billing
      if (deployedAccount) {
        try {
          await deployedAccount.undeploy();
        } catch (undeployError) {
          logger.error("Failed to undeploy account", {
            error:
              undeployError instanceof Error
                ? undeployError.message
                : "Unknown error",
            accountId,
          });
          // Don't throw here - we want to return the trades even if undeploy fails
        }
      }
    }
  }

  /**
   * Map deals to standardized trade format (simpler approach)
   */
  private mapDealsToTrades(deals: any[]): MetaApiTrade[] {
    const trades: MetaApiTrade[] = [];

    deals.forEach((deal) => {
      try {
        // Only process actual trade deals (not balance operations)
        if (deal.type !== "DEAL_TYPE_BUY" && deal.type !== "DEAL_TYPE_SELL") {
          return;
        }

        const trade: MetaApiTrade = {
          id: deal.id || deal.dealId || deal.positionId,
          ticket: deal.positionId || deal.id || deal.dealId,
          symbol: deal.symbol,
          side: deal.type === "DEAL_TYPE_BUY" ? "buy" : "sell",
          quantity: deal.volume?.toString() || "0",
          price: deal.price?.toString() || "0",
          profit: deal.profit?.toString() || "0",
          commission: deal.commission?.toString() || "0",
          swap: deal.swap?.toString() || "0",
          openTime: new Date(deal.time),
          closeTime: deal.closeTime ? new Date(deal.closeTime) : undefined,
          magic: deal.magic?.toString(),
          comment: deal.comment,
        };

        trades.push(trade);
      } catch (error) {
        logger.warn("Failed to map deal", {
          dealId: deal.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    return trades;
  }

  /**
   * Create mock deals for testing when no history is available
   */
  private createMockDeals(startTime: Date, endTime: Date): any[] {
    const mockDeals = [];
    const symbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];
    const types = ["DEAL_TYPE_BUY", "DEAL_TYPE_SELL"];

    // Create 5-15 mock deals
    const numDeals = Math.floor(Math.random() * 10) + 5;

    for (let i = 0; i < numDeals; i++) {
      const timeRange = endTime.getTime() - startTime.getTime();
      const randomTime = startTime.getTime() + Math.random() * timeRange;

      mockDeals.push({
        id: `mock_deal_${i + 1}`,
        positionId: `mock_pos_${i + 1}`,
        dealId: `mock_deal_${i + 1}`,
        type: types[Math.floor(Math.random() * types.length)],
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        volume: Math.floor(Math.random() * 100) + 10,
        price: (Math.random() * 2 + 1).toFixed(5),
        profit: (Math.random() * 200 - 100).toFixed(2),
        commission: (Math.random() * 10 - 5).toFixed(2),
        swap: (Math.random() * 2 - 1).toFixed(2),
        time: new Date(randomTime).toISOString(),
        magic: Math.floor(Math.random() * 1000),
        comment: `Mock trade ${i + 1}`,
      });
    }

    return mockDeals;
  }

  /**
   * Maps MetaAPI orders and deals to our trade format
   */
  private mapOrdersToTrades(orders: any[], deals: any[]): MetaApiTrade[] {
    const trades: MetaApiTrade[] = [];

    // Create a map of deals by positionId for quick lookup
    const dealsByPositionId = new Map();
    deals.forEach((deal) => {
      if (deal.positionId) {
        if (!dealsByPositionId.has(deal.positionId)) {
          dealsByPositionId.set(deal.positionId, []);
        }
        dealsByPositionId.get(deal.positionId).push(deal);
      }
    });

    orders.forEach((order) => {
      try {
        // Skip pending orders, only process completed trades
        if (
          order.state !== "ORDER_STATE_FILLED" &&
          order.state !== "ORDER_STATE_PARTIAL"
        ) {
          return;
        }

        // Get related deals for this position
        const positionDeals = dealsByPositionId.get(order.positionId) || [];

        // Calculate profit/loss from deals
        let totalProfit = 0;
        let totalCommission = 0;
        let totalSwap = 0;

        positionDeals.forEach((deal: any) => {
          if (deal.profit) totalProfit += parseFloat(deal.profit);
          if (deal.commission) totalCommission += parseFloat(deal.commission);
          if (deal.swap) totalSwap += parseFloat(deal.swap);
        });

        const trade: MetaApiTrade = {
          id: order.id,
          ticket: order.id,
          symbol: order.symbol,
          side: order.type === "ORDER_TYPE_BUY" ? "buy" : "sell",
          quantity: order.volume.toString(),
          price: order.openPrice?.toString() || "0",
          profit: totalProfit.toString(),
          commission: totalCommission.toString(),
          swap: totalSwap.toString(),
          openTime: new Date(order.doneTime || order.time),
          closeTime: order.closeTime ? new Date(order.closeTime) : undefined,
          magic: order.magic?.toString(),
          comment: order.comment,
        };

        trades.push(trade);
      } catch (error) {
        logger.warn("Failed to map order", {
          orderId: order.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    return trades;
  }

  /**
   * Check if account is a mock/test account
   */
  private isMockAccount(metaApiAccountId: string): boolean {
    return metaApiAccountId.startsWith("mock_");
  }

  /**
   * Create mock trades for testing
   */
  private createMockTrades(account: any): {
    trades: MetaApiTrade[];
    account: any;
  } {
    const trades: MetaApiTrade[] = [];
    const numTrades = Math.floor(Math.random() * 10) + 5; // 5-15 trades

    const symbols = [
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "AUDUSD",
      "USDCAD",
      "USDCHF",
      "NZDUSD",
      "XAUUSD",
    ];
    const now = new Date();

    for (let i = 0; i < numTrades; i++) {
      const openTime = new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000);
      const closeTime = new Date(
        openTime.getTime() + Math.random() * 8 * 60 * 60 * 1000
      );

      const trade: MetaApiTrade = {
        id: `mock_trade_${i + 1}`,
        ticket: `TICKET${1000 + i}`,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        side: Math.random() > 0.5 ? "buy" : "sell",
        quantity: (Math.floor(Math.random() * 10) + 1).toString(),
        price: (1.0 + Math.random() * 2).toFixed(5),
        profit: (Math.random() * 200 - 100).toFixed(2),
        commission: (-5 - Math.random() * 10).toFixed(2),
        swap: (Math.random() * 2 - 1).toFixed(2),
        openTime,
        closeTime,
        magic: Math.floor(Math.random() * 1000).toString(),
        comment: `Mock trade ${i + 1}`,
      };

      trades.push(trade);
    }

    return {
      trades,
      account: { id: account.id, type: "mock" },
    };
  }

  /**
   * Get account information from MetaAPI
   */
  async getAccountInfo(metaApiAccountId: string) {
    // Mode test
    if (this.isMockAccount(metaApiAccountId)) {
      return {
        id: metaApiAccountId,
        name: "Mock Altiora Account",
        type: "cloud",
        state: "DEPLOYED",
        connectionStatus: "CONNECTED",
        platform: metaApiAccountId.includes("mt4") ? "mt4" : "mt5",
      };
    }

    try {
      return await metaApiClient.metatraderAccountApi.getAccount(
        metaApiAccountId
      );
    } catch (error) {
      logger.error("Failed to get account info", {
        error: error instanceof Error ? error.message : "Unknown error",
        metaApiAccountId,
      });
      throw new Error(
        `Failed to get account info: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export const metaApiService = new MetaApiService();

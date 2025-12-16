import { Request, Response, NextFunction } from "express";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { asyncHandler, logger } from "../middleware/errorHandler";
import { validateRequest } from "../middleware/validation";
import { encryptPassword } from "../utils/encryption";
import { metaApiService } from "../services/metaapi.service";
import { databaseService } from "../services/database.service";
import { db } from "../database/index";
import { mtTrades } from "../database/schema/accounts";
import { eq, desc } from "drizzle-orm";
import {
  ConnectAccountRequest,
  ConnectAccountResponse,
  ApiSuccess,
  ApiFailure,
} from "../types/api";

const connectAccountSchema = z.object({
  platform: z.enum(["mt4", "mt5"]),
  login: z.string().min(1).max(50),
  password: z.string().min(1),
  server: z.string().min(1).max(100),
});

// Connect account endpoint - provisions a new MetaTrader account
export const connectAccount = asyncHandler(
  async (req: Request, res: Response) => {
    const { platform, login, password, server }: ConnectAccountRequest =
      req.body;

    // For now, we'll use a dummy userId - in production this would come from JWT
    // TODO: Extract userId from JWT token
    const userId = (req.headers["x-user-id"] as string) || "user_" + createId();

    // Encrypt the password before storing
    const encryptedPassword = encryptPassword(password);

    // Create account in MetaAPI
    const metaApiAccountId = await metaApiService.createAccount(
      platform,
      login,
      password, // Use decrypted password for MetaAPI
      server
    );

    // Create account record in database
    const accountId = createId();
    await databaseService.createAccount({
      id: accountId,
      userId,
      platform,
      login,
      encryptedPassword,
      server,
      metaApiAccountId,
    });

    const response: ApiSuccess<ConnectAccountResponse> = {
      success: true,
      data: {
        accountId,
        metaApiAccountId,
        message: "Account connected successfully. You can now sync trades.",
      },
    };

    res.status(201).json(response);
  }
);

// Get account details (without sensitive info)
export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const { accountId } = req.params;

  const account = await databaseService.getAccount(accountId);

  if (!account) {
    const response: ApiFailure = {
      success: false,
      error: {
        error: "ACCOUNT_NOT_FOUND",
        message: "Account not found",
      },
    };
    return res.status(404).json(response);
  }

  // Remove sensitive data
  const { encryptedPassword, ...safeAccount } = account;

  const response: ApiSuccess<typeof safeAccount> = {
    success: true,
    data: safeAccount,
  };

  res.json(response);
});

// List user accounts
// Endpoint pour récupérer la liste des serveurs disponibles
export const getServers = asyncHandler(async (req: Request, res: Response) => {
  const { broker } = req.query;

  if (!broker || typeof broker !== "string") {
    const response: ApiFailure = {
      success: false,
      error: {
        error: "VALIDATION_ERROR",
        message: "Broker parameter is required",
      },
    };
    return res.status(400).json(response);
  }

  try {
    const MetaApiModule = require("metaapi.cloud-sdk");
    const MetaApi = MetaApiModule.default || MetaApiModule;
    const metaApiClient = new MetaApi(process.env.META_API_TOKEN);

    const servers = await metaApiClient.metatraderAccountApi.getAccountTypes();

    const response: ApiSuccess<any> = {
      success: true,
      data: servers,
    };

    res.json(response);
  } catch (error) {
    logger.error("Failed to get servers", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    const response: ApiFailure = {
      success: false,
      error: {
        error: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch servers: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    };
    res.status(500).json(response);
  }
});

export const listAccounts = asyncHandler(
  async (req: Request, res: Response) => {
    // TODO: Extract userId from JWT token
    const userId = (req.headers["x-user-id"] as string) || "user_" + createId();

    // For now, return empty array - implement when we have proper auth
    const response: ApiSuccess<any[]> = {
      success: true,
      data: [],
    };

    res.json(response);
  }
);

// List all MetaAPI accounts (directly from MetaAPI cloud)
export const listMetaApiAccounts = asyncHandler(
  async (req: Request, res: Response) => {
    const accounts = await metaApiService.listAllMetaApiAccounts();

    const response: ApiSuccess<any[]> = {
      success: true,
      data: accounts,
    };

    res.json(response);
  }
);

// Undeploy account - stop MetaAPI billing
export const undeployAccount = asyncHandler(
  async (req: Request, res: Response) => {
    const { accountId } = req.params;

    // Get account from database
    const account = await databaseService.getAccount(accountId);

    if (!account) {
      const response: ApiFailure = {
        success: false,
        error: {
          error: "ACCOUNT_NOT_FOUND",
          message: "Account not found",
        },
      };
      return res.status(404).json(response);
    }

    // Undeploy from MetaAPI
    const result = await metaApiService.undeployAccount(account.metaApiAccountId);

    const response: ApiSuccess<typeof result> = {
      success: true,
      data: result,
    };

    res.json(response);
  }
);

// Delete account from MetaAPI (and optionally from database)
export const deleteAccount = asyncHandler(
  async (req: Request, res: Response) => {
    const { accountId } = req.params;
    const { deleteFromDatabase } = req.query;

    // Get account from database
    const account = await databaseService.getAccount(accountId);

    if (!account) {
      const response: ApiFailure = {
        success: false,
        error: {
          error: "ACCOUNT_NOT_FOUND",
          message: "Account not found",
        },
      };
      return res.status(404).json(response);
    }

    // Delete from MetaAPI
    const result = await metaApiService.deleteAccount(account.metaApiAccountId);

    // Optionally delete from database
    if (deleteFromDatabase === "true") {
      await databaseService.deleteAccount(accountId);
      result.message += " and removed from database";
    }

    const response: ApiSuccess<typeof result> = {
      success: true,
      data: result,
    };

    res.json(response);
  }
);

export const getAccountTrades = asyncHandler(
  async (req: Request, res: Response) => {
    const { accountId } = req.params;

    // TODO: Add user authentication check
    // const userId = req.headers['x-user-id'] as string;

    // Get trades for this account from database
    const trades = await db
      .select()
      .from(mtTrades)
      .where(eq(mtTrades.accountId, accountId))
      .orderBy(desc(mtTrades.openTime));

    const response: ApiSuccess<any[]> = {
      success: true,
      data: trades,
    };

    res.json(response);
  }
);

export const accountValidators = {
  connectAccount: validateRequest(connectAccountSchema),
};

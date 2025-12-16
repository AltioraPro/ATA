import { z } from 'zod';

// Request/Response types for account connection
export const connectAccountSchema = z.object({
  platform: z.enum(['mt4', 'mt5']),
  login: z.string().min(1).max(50),
  password: z.string().min(1),
  server: z.string().min(1).max(100),
  userId: z.string().min(1), // From JWT token
});

export type ConnectAccountRequest = z.infer<typeof connectAccountSchema>;

export const connectAccountResponseSchema = z.object({
  accountId: z.string(),
  metaApiAccountId: z.string(),
  message: z.string(),
});

export type ConnectAccountResponse = z.infer<typeof connectAccountResponseSchema>;

// Request/Response types for account sync
export const syncAccountSchema = z.object({
  accountId: z.string(),
});

export type SyncAccountRequest = z.infer<typeof syncAccountSchema>;

export const syncAccountResponseSchema = z.object({
  accountId: z.string(),
  tradesFetched: z.number(),
  tradesInserted: z.number(),
  syncLogId: z.string(),
  message: z.string(),
});

export type SyncAccountResponse = z.infer<typeof syncAccountResponseSchema>;

// MetaAPI trade data structure
export interface MetaApiTrade {
  id: string;
  ticket: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  profit?: string;
  commission?: string;
  swap?: string;
  openTime: Date;
  closeTime?: Date;
  magic?: string;
  comment?: string;
}

// API Error response
export interface ApiError {
  error: string;
  message: string;
  details?: any;
}

// Success response wrapper
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

// Error response wrapper
export interface ApiFailure {
  success: false;
  error: ApiError;
}

// Generic API response type
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;


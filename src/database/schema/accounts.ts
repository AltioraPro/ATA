import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const mtAccounts = pgTable(
  "mt_account",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(), // Reference to frontend user

    // MetaTrader account details
    platform: varchar("platform", { length: 10 }).notNull(), // "mt4" or "mt5"
    login: varchar("login", { length: 50 }).notNull(),
    encryptedPassword: text("encrypted_password").notNull(),
    server: varchar("server", { length: 100 }).notNull(),

    // MetaApi account details
    metaApiAccountId: varchar("metaapi_account_id", { length: 255 }).notNull(),

    // Sync tracking
    lastSyncTime: timestamp("last_sync_time", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("mt_account_user_id_idx").on(table.userId),
    metaApiAccountIdIdx: index("mt_account_metaapi_account_id_idx").on(table.metaApiAccountId),
    loginPlatformIdx: index("mt_account_login_platform_idx").on(table.login, table.platform),
  })
);

export const mtTrades = pgTable(
  "mt_trade",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    accountId: varchar("account_id", { length: 255 })
      .references(() => mtAccounts.id, { onDelete: "cascade" })
      .notNull(),

    // MetaTrader trade details
    ticket: varchar("ticket", { length: 50 }).notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    side: varchar("side", { length: 10 }).notNull(), // "buy" or "sell"
    quantity: varchar("quantity", { length: 20 }).notNull(),
    price: varchar("price", { length: 20 }).notNull(),
    profit: varchar("profit", { length: 20 }),
    commission: varchar("commission", { length: 20 }),
    swap: varchar("swap", { length: 20 }),

    // Timestamps
    openTime: timestamp("open_time", { withTimezone: true }).notNull(),
    closeTime: timestamp("close_time", { withTimezone: true }),

    // Additional MetaTrader fields
    magic: varchar("magic", { length: 20 }),
    comment: text("comment"),

    // Sync metadata
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    accountIdIdx: index("mt_trade_account_id_idx").on(table.accountId),
    ticketIdx: index("mt_trade_ticket_idx").on(table.ticket),
    symbolIdx: index("mt_trade_symbol_idx").on(table.symbol),
    openTimeIdx: index("mt_trade_open_time_idx").on(table.openTime),
    syncedAtIdx: index("mt_trade_synced_at_idx").on(table.syncedAt),
    accountTicketUnique: uniqueIndex("mt_trade_account_ticket_unique").on(table.accountId, table.ticket),
  })
);

export const syncLogs = pgTable(
  "sync_log",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    accountId: varchar("account_id", { length: 255 })
      .references(() => mtAccounts.id, { onDelete: "cascade" })
      .notNull(),

    // Sync operation details
    status: varchar("status", { length: 20 }).notNull(), // "pending", "success", "error", "partial"
    tradesFetched: varchar("trades_fetched", { length: 10 }).default("0"),
    tradesInserted: varchar("trades_inserted", { length: 10 }).default("0"),
    errorMessage: text("error_message"),

    // Timing
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    accountIdIdx: index("sync_log_account_id_idx").on(table.accountId),
    statusIdx: index("sync_log_status_idx").on(table.status),
    startedAtIdx: index("sync_log_started_at_idx").on(table.startedAt),
  })
);

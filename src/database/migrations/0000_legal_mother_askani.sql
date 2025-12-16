CREATE TABLE IF NOT EXISTS "mt_account" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"platform" varchar(10) NOT NULL,
	"login" varchar(50) NOT NULL,
	"encrypted_password" text NOT NULL,
	"server" varchar(100) NOT NULL,
	"metaapi_account_id" varchar(255) NOT NULL,
	"last_sync_time" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mt_trade" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"ticket" varchar(50) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"side" varchar(10) NOT NULL,
	"quantity" varchar(20) NOT NULL,
	"price" varchar(20) NOT NULL,
	"profit" varchar(20),
	"commission" varchar(20),
	"swap" varchar(20),
	"open_time" timestamp with time zone NOT NULL,
	"close_time" timestamp with time zone,
	"magic" varchar(20),
	"comment" text,
	"synced_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_log" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"trades_fetched" varchar(10) DEFAULT '0',
	"trades_inserted" varchar(10) DEFAULT '0',
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_account_user_id_idx" ON "mt_account" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_account_metaapi_account_id_idx" ON "mt_account" ("metaapi_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_account_login_platform_idx" ON "mt_account" ("login","platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_trade_account_id_idx" ON "mt_trade" ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_trade_ticket_idx" ON "mt_trade" ("ticket");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_trade_symbol_idx" ON "mt_trade" ("symbol");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_trade_open_time_idx" ON "mt_trade" ("open_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_trade_synced_at_idx" ON "mt_trade" ("synced_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_log_account_id_idx" ON "sync_log" ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_log_status_idx" ON "sync_log" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_log_started_at_idx" ON "sync_log" ("started_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mt_trade" ADD CONSTRAINT "mt_trade_account_id_mt_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "mt_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_account_id_mt_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "mt_account"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

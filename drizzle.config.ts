import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/database/schema/accounts.ts",
  out: "./src/database/migrations",
  dialect: "pg",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});

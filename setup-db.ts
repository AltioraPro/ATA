import "dotenv/config";
import postgres from "postgres";
import fs from "fs";
import path from "path";

// Read migration files
const migrationPath1 = path.join(
  process.cwd(),
  "src/database/migrations/0000_legal_mother_askani.sql"
);
const migrationPath2 = path.join(
  process.cwd(),
  "src/database/migrations/0001_spooky_wendell_rand.sql"
);

const migrationSQL1 = fs.readFileSync(migrationPath1, "utf8");
const migrationSQL2 = fs.readFileSync(migrationPath2, "utf8");
const migrationSQL = migrationSQL1 + "\n" + migrationSQL2;

// Connect to database
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL not found in environment variables");
  process.exit(1);
}

const sql = postgres(connectionString);

async function setupDatabase() {
  try {
    console.log("🚀 Setting up database...");

    // Split SQL by statement-breakpoint and execute each statement
    const statements = migrationSQL.split("--> statement-breakpoint");

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        console.log(`📝 Executing statement ${i + 1}/${statements.length}...`);
        await sql.unsafe(statement);
      }
    }

    console.log("✅ Database setup completed successfully!");
    console.log("📊 Created tables: mt_account, mt_trade, sync_log");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

setupDatabase();

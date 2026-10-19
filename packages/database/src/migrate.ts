import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDbPool } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    console.log("Running database migrations...");
    const migrationFile = path.resolve(__dirname, "../migrations/0001_initial.sql");
    const sql = fs.readFileSync(migrationFile, "utf-8");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Migrations applied successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

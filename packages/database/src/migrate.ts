import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { getServerEnv } from "@startup/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Arbitrary constant shared by every deploy so concurrent migrators serialize.
const MIGRATION_LOCK_KEY = 72_104_331;

export const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

/**
 * Applies pending `migrations/*.sql` files in filename order, each in its own
 * transaction, recording them in `schema_migrations`. Safe to run concurrently
 * from several containers: a session advisory lock serializes runners.
 */
export async function runMigrations(options: { log?: (msg: string) => void } = {}): Promise<string[]> {
  const log = options.log ?? console.log;
  const env = getServerEnv();
  // Migrations may need a privileged/direct (non-pooler) connection, e.g. on Supabase.
  const pool = new Pool({ connectionString: env.MIGRATION_DATABASE_URL || env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const done = new Set(
      (await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version)
    );
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      log(`Applying migration ${file}...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }

    log(applied.length > 0 ? `Applied ${applied.length} migration(s).` : "Database schema is up to date.");
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

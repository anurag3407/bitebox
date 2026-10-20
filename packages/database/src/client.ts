import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, PoolClient } from "pg";
import { getServerEnv } from "@startup/config";
import * as schema from "./schema/schema.js";

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const env = getServerEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      // Bound runaway queries so one slow statement cannot exhaust the pool
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 30000,
      application_name: process.env.SERVICE_NAME ?? "startup",
    });
    // An idle client losing its connection emits 'error' on the pool; without a
    // listener Node treats it as unhandled and crashes the process.
    pool.on("error", (err) => {
      console.error("[db] idle client error", err.message);
    });
  }
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    db = drizzle(getDbPool(), { schema });
  }
  return db;
}

/**
 * Runs `fn` inside a single database transaction on a dedicated client.
 * Commits on success, rolls back on any thrown error and always releases the client.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await getDbPool().query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, error: (err as Error).message };
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    db = null;
    await closing.end();
  }
}

export type { PoolClient };

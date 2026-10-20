import { checkDatabaseHealth } from "@startup/database";
import { getRedis } from "@startup/integrations";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Readiness: the load balancer stops routing here when Postgres is unreachable.
 * Redis is reported but not fatal (the app degrades without it).
 */
export async function GET() {
  const [db, redis] = await Promise.all([checkDatabaseHealth(), getRedis().ping()]);
  const ready = db.ok;
  return NextResponse.json(
    { status: ready ? "ready" : "unavailable", checks: { database: db, redis } },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}

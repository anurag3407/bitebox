import { apiSuccess } from "@/server/api-response";

export const dynamic = "force-dynamic";

/** Liveness: the process is up. Use /health/ready for dependency checks. */
export async function GET() {
  return apiSuccess({
    status: "healthy",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

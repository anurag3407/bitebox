import { apiSuccess } from "@/server/api-response";

export async function GET() {
  return apiSuccess({
    status: "healthy",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

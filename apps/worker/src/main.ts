import { closeDbPool } from "@startup/database";
import { getServerEnv } from "@startup/config";
import { WorkerRunner } from "./runner.js";
import { logger } from "./logger.js";

// Fail fast on invalid/insecure configuration before touching any queue
getServerEnv();

const runner = new WorkerRunner();
runner.start(1000);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown requested", { signal });
  // Jobs not finished in time keep their lease and are retried by another worker
  await runner.stop(25_000);
  await closeDbPool().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", { error: (reason as Error)?.message ?? String(reason) });
});

import { defineConfig } from "vitest/config";
import path from "node:path";

// Applied to this process (globalSetup) and inherited by test workers
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost:5432/startup_test";
process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";
process.env.WORKER_SILENT = "true";
process.env.LOG_LEVEL = "error";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/web/src"),
    },
  },
  test: {
    environment: "node",
    // Suites share one database; run files sequentially for deterministic state
    fileParallelism: false,
    globalSetup: ["./packages/database/tests/global-setup.ts"],
    testTimeout: 20_000,
  },
});

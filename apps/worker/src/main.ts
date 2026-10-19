import { WorkerRunner } from "./runner.js";

const runner = new WorkerRunner();
runner.start(2000);

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  runner.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  runner.stop();
  process.exit(0);
});

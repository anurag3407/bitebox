import { ClaimedJob, JobKind, JobRepository, OutboxRepository } from "@startup/database";
import { JOB_HANDLERS, settlementCutoff } from "./handlers.js";
import { logger } from "./logger.js";
import { NotificationService } from "./notifications.js";

const MAINTENANCE_INTERVAL_MS = 60_000;
const JOB_CONCURRENCY = 5;

export class WorkerRunner {
  private workerId: string;
  private isRunning = false;
  private timers: NodeJS.Timeout[] = [];
  private inflight = new Set<Promise<unknown>>();
  readonly notifications: NotificationService;

  constructor(workerId: string = `worker_${process.pid}_${Date.now()}`, notifications = new NotificationService()) {
    this.workerId = workerId;
    this.notifications = notifications;
  }

  private async runJob(job: ClaimedJob): Promise<void> {
    const handler = JOB_HANDLERS[job.kind];
    try {
      if (!handler) {
        logger.warn("unknown job kind", { jobId: job.id, kind: job.kind });
      } else {
        await handler(job);
      }
      await JobRepository.completeJob(job.id, this.workerId);
    } catch (err) {
      const message = (err as Error)?.message || "Unknown error";
      const outcome = await JobRepository.failJob(job.id, this.workerId, message);
      logger[outcome === "FAILED" ? "error" : "warn"]("job failed", {
        jobId: job.id,
        kind: job.kind,
        attempt: job.attemptCount,
        outcome,
        error: message,
      });
    }
  }

  /**
   * Executes a single pass of job claiming and execution. Useful for testing and cron.
   */
  async runOnce(): Promise<number> {
    const jobs = await JobRepository.claimRunnableJobs(this.workerId, 20, 60);
    for (let i = 0; i < jobs.length; i += JOB_CONCURRENCY) {
      await Promise.all(jobs.slice(i, i + JOB_CONCURRENCY).map((job) => this.runJob(job)));
    }
    return jobs.length;
  }

  /** Publishes pending outbox events to notification channels. */
  async publishOutboxOnce(): Promise<number> {
    const events = await OutboxRepository.claimBatch(50);
    for (const event of events) {
      try {
        await this.notifications.handle(event);
        await OutboxRepository.markProcessed(event.id);
      } catch (err) {
        await OutboxRepository.markFailed(event.id, (err as Error)?.message ?? String(err));
        logger.warn("outbox publish failed", { eventId: event.id, type: event.eventType, error: (err as Error)?.message });
      }
    }
    return events.length;
  }

  async scheduleMaintenance(): Promise<void> {
    const bucket = Math.floor(Date.now() / MAINTENANCE_INTERVAL_MS);
    await JobRepository.enqueue(JobKind.MAINTENANCE, {}, { dedupeKey: `maintenance:${bucket}`, maxAttempts: 1 });
    // Once per week (dedupe key = the week's cutoff); safe to enqueue from every worker
    const cutoff = settlementCutoff();
    await JobRepository.enqueue(JobKind.WEEKLY_SETTLEMENT, { cutoff: cutoff.toISOString() }, {
      dedupeKey: `settlement:${cutoff.toISOString()}`,
      maxAttempts: 5,
    });
  }

  private loop(name: string, intervalMs: number, fn: () => Promise<number | void>): void {
    const tick = async () => {
      if (!this.isRunning) return;
      const run = fn()
        .then((count) => {
          // Drain quickly while there is a backlog
          return typeof count === "number" && count > 0 ? 50 : intervalMs;
        })
        .catch((err) => {
          logger.error(`${name} loop error`, { error: (err as Error)?.message });
          return intervalMs * 2;
        });
      this.inflight.add(run);
      const delay = await run;
      this.inflight.delete(run);
      if (this.isRunning) this.timers.push(setTimeout(tick, delay));
    };
    void tick();
  }

  start(intervalMs: number = 1000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info("worker started", { workerId: this.workerId });
    this.loop("jobs", intervalMs, () => this.runOnce());
    this.loop("outbox", intervalMs, () => this.publishOutboxOnce());
    this.loop("scheduler", MAINTENANCE_INTERVAL_MS, () => this.scheduleMaintenance());
  }

  /** Stops claiming new work and waits (bounded) for in-flight work to finish. */
  async stop(timeoutMs = 25_000): Promise<void> {
    this.isRunning = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    await Promise.race([Promise.allSettled([...this.inflight]), new Promise((r) => setTimeout(r, timeoutMs))]);
    logger.info("worker stopped", { workerId: this.workerId });
  }
}

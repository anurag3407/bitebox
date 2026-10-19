import { FulfillmentState } from "@startup/contracts";
import {
  ClaimedJob,
  JobRepository,
  LedgerRepository,
  OrderRepository,
  getDb,
  orders,
  refunds,
} from "@startup/database";
import { LedgerEngine } from "@startup/core";
import { BrevoEmailAdapter, Fast2SmsAdapter } from "@startup/integrations";
import { eq } from "drizzle-orm";

export class WorkerRunner {
  private workerId: string;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private smsAdapter = new Fast2SmsAdapter();
  private emailAdapter = new BrevoEmailAdapter();

  constructor(workerId: string = `worker_${process.pid}_${Date.now()}`) {
    this.workerId = workerId;
  }

  /**
   * Executes a single pass of job claiming and execution. Useful for testing and cron.
   */
  async runOnce(): Promise<number> {
    const jobs = await JobRepository.claimRunnableJobs(this.workerId, 10, 30);
    for (const job of jobs) {
      try {
        await this.processJob(job);
        await JobRepository.completeJob(job.id, this.workerId);
      } catch (err: any) {
        console.error(`Worker job ${job.id} (${job.kind}) failed:`, err);
        await JobRepository.failJob(job.id, this.workerId, err.message || "Unknown error");
      }
    }
    return jobs.length;
  }

  private async processJob(job: ClaimedJob): Promise<void> {
    switch (job.kind) {
      case "MERCHANT_ACCEPTANCE_TIMEOUT": {
        const orderId = job.payload.orderId as string;
        if (!orderId) throw new Error("Missing orderId in job payload");

        const order = await OrderRepository.findById(orderId);
        if (!order) return;

        // If order is still awaiting merchant acceptance after deadline
        if (order.fulfillmentState === FulfillmentState.AWAITING_MERCHANT) {
          console.log(`[Worker] Expiring merchant acceptance for order ${order.orderNumber}`);

          await OrderRepository.updateFulfillmentState({
            orderId,
            fromState: FulfillmentState.AWAITING_MERCHANT,
            toState: FulfillmentState.CANCELLED,
            actorType: "SYSTEM",
            reason: "Merchant response deadline of 90 seconds expired",
          });

          // Initiate refund record
          const db = getDb();
          await db.insert(refunds).values({
            orderId,
            amountPaise: order.breakdown.payablePaise,
            reason: "Auto-refund: Merchant did not accept in time",
            status: "APPROVED",
          });

          // Post balanced double-entry ledger refund transaction
          const refundEntries = LedgerEngine.buildRefundEntries(
            order.breakdown.payablePaise,
            "Auto-refund: Merchant did not accept in time"
          );
          await LedgerRepository.postTransaction({
            orderId,
            effectType: "REFUND",
            entries: refundEntries,
          });

          // Send notifications using customer contact phone
          const customerPhone = order.deliveryAddress?.contactPhone || "+919876543210";

          await this.smsAdapter.sendSms({
            phone: customerPhone,
            message: `Your order ${order.orderNumber} was auto-cancelled because the restaurant was unable to accept it in time. A full refund of ₹${order.breakdown.payablePaise / 100} has been initiated.`,
          });
        }
        break;
      }

      case "DISPATCH_OFFER_TIMEOUT": {
        console.log(`[Worker] Handling dispatch offer timeout`, job.payload);
        break;
      }

      default:
        console.log(`[Worker] Unknown or unhandled job kind: ${job.kind}`);
        break;
    }
  }

  start(intervalMs: number = 2000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`Worker started with ID: ${this.workerId}`);

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.runOnce();
      } catch (err) {
        console.error("Worker loop tick error:", err);
      }
      if (this.isRunning) {
        this.timer = setTimeout(loop, intervalMs);
      }
    };

    loop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`Worker stopped: ${this.workerId}`);
  }
}

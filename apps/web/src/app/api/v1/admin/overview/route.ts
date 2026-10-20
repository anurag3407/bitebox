import { UserRole } from "@startup/contracts";
import { JobRepository, LedgerRepository, OutboxRepository, getDbPool } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { route } from "@/server/route";

/** Operations health: live order funnel, fleet, queues and ledger balance. */
export const GET = route(async (req, _ctx, requestId) => {
  await requireAuth(req, [UserRole.ADMIN]);
  const pool = getDbPool();
  const [funnel, fleet, today, refunds, jobs, outbox, balances] = await Promise.all([
    pool.query(
      `SELECT fulfillment_state AS state, COUNT(*)::int AS count FROM orders
        WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY 1`
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE is_online)::int AS online,
              COUNT(*) FILTER (WHERE is_online AND last_ping_at > NOW() - INTERVAL '2 minutes')::int AS fresh
         FROM riders WHERE is_approved`
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE payment_status <> 'PENDING')::int AS paid_orders,
              COALESCE(SUM(payable_paise) FILTER (WHERE payment_status <> 'PENDING'), 0)::bigint AS gmv_paise,
              COUNT(*) FILTER (WHERE fulfillment_state = 'DELIVERED')::int AS delivered,
              COUNT(*) FILTER (WHERE fulfillment_state IN ('CANCELLED', 'DELIVERY_FAILED') AND payment_status <> 'PENDING')::int AS failed_paid,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM delivered_at - created_at) / 60)
                FILTER (WHERE delivered_at IS NOT NULL) AS median_delivery_minutes
         FROM orders WHERE created_at > NOW() - INTERVAL '24 hours'`
    ),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM refunds WHERE status NOT IN ('PROCESSED') GROUP BY 1`),
    JobRepository.stats(),
    OutboxRepository.backlog(),
    LedgerRepository.getAccountBalances(),
  ]);

  const t = today.rows[0];
  const totalDebit = balances.reduce((s, b) => s + b.netDebitPaise, 0);
  const totalCredit = balances.reduce((s, b) => s + b.netCreditPaise, 0);

  return apiSuccess(
    {
      last24h: {
        funnel: Object.fromEntries(funnel.rows.map((r) => [r.state, r.count])),
        paidOrders: t.paid_orders,
        gmvPaise: Number(t.gmv_paise),
        delivered: t.delivered,
        failedAfterPayment: t.failed_paid,
        medianDeliveryMinutes: t.median_delivery_minutes ? Math.round(t.median_delivery_minutes) : null,
      },
      fleet: fleet.rows[0],
      openRefunds: Object.fromEntries(refunds.rows.map((r) => [r.status, r.count])),
      jobs,
      outbox,
      ledger: { balanced: totalDebit === totalCredit, totalDebitPaise: totalDebit, totalCreditPaise: totalCredit, accounts: balances },
    },
    200,
    { requestId }
  );
});

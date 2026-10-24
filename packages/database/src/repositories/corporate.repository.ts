import type { QuoteBreakdown } from "@startup/contracts";
import { DomainError, LedgerEngine, calculateCorporateSplit, corporateBillingMonth, generateOrderNumber, generateVerificationOtp } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { JobKind, JobRepository } from "./job.repository.js";
import { LedgerRepository } from "./ledger.repository.js";
import { OutboxRepository } from "./outbox.repository.js";

function monthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new DomainError("VALIDATION_ERROR", "Month must be YYYY-MM");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new DomainError("VALIDATION_ERROR", "Invalid month");
  const istOffsetMs = 330 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1) - istOffsetMs),
    end: new Date(Date.UTC(year, monthIndex + 1, 1) - istOffsetMs),
  };
}

export class CorporateRepository {
  static async createAccount(input: {
    companyName: string;
    gstin: string;
    billingAddress: string;
    dropPointId: string;
    dailyAllowancePerEmployeePaise: number;
    subsidyPercentageBp?: number;
    corporateManagementFeeBp?: number;
    creditLimitPaise?: number;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO corporate_accounts
         (company_name, gstin, billing_address, drop_point_id, daily_allowance_per_employee_paise,
          subsidy_percentage_bp, corporate_management_fee_bp, credit_limit_paise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        input.companyName,
        input.gstin,
        input.billingAddress,
        input.dropPointId,
        input.dailyAllowancePerEmployeePaise,
        input.subsidyPercentageBp ?? 10000,
        input.corporateManagementFeeBp ?? 500,
        input.creditLimitPaise ?? 0,
      ]
    );
    return res.rows[0];
  }

  static async addEmployee(input: {
    corporateAccountId: string;
    userId: string;
    costCenterCode: string;
    emailDomain: string;
  }) {
    const res = await getDbPool().query(
      `INSERT INTO corporate_employees (corporate_account_id, user_id, cost_center_code, email_domain)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (corporate_account_id, user_id)
       DO UPDATE SET cost_center_code = EXCLUDED.cost_center_code,
                     email_domain = EXCLUDED.email_domain, is_active = true
       RETURNING *`,
      [input.corporateAccountId, input.userId, input.costCenterCode, input.emailDomain]
    );
    return res.rows[0];
  }

  static async findAccountForUser(userId: string) {
    const res = await getDbPool().query(
      `SELECT a.*, e.cost_center_code, e.email_domain
         FROM corporate_employees e JOIN corporate_accounts a ON a.id = e.corporate_account_id
        WHERE e.user_id = $1 AND e.is_active AND a.is_active
        ORDER BY e.created_at ASC LIMIT 1`,
      [userId]
    );
    return res.rows[0] ?? null;
  }

  static async splitForUser(input: {
    userId: string;
    corporateAccountId: string;
    orderTotalPaise: number;
    alreadyUsedPaise?: number;
  }) {
    const employee = await getDbPool().query(
      `SELECT e.*, a.* FROM corporate_employees e JOIN corporate_accounts a ON a.id = e.corporate_account_id
        WHERE e.user_id = $1 AND e.corporate_account_id = $2 AND e.is_active AND a.is_active`,
      [input.userId, input.corporateAccountId]
    );
    const account = employee.rows[0];
    if (!account) throw new DomainError("FORBIDDEN", "You are not an active member of this corporate account");
    return {
      account,
      split: calculateCorporateSplit({
        orderTotalPaise: input.orderTotalPaise,
        dailyAllowancePaise: account.daily_allowance_per_employee_paise,
        subsidyBp: account.subsidy_percentage_bp,
        managementFeeBp: account.corporate_management_fee_bp,
        alreadyUsedPaise: input.alreadyUsedPaise ?? 0,
      }),
    };
  }

  /**
   * Creates a corporate order: the employee pays only the overage; the company
   * allowance is posted to corporate receivable and added to the monthly bill.
   */
  static async createCorporateOrder(input: {
    userId: string;
    quoteId: string;
    corporateAccountId: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    return withTransaction(async (client) => {
      const quoteRes = await client.query(`SELECT * FROM quotes WHERE id = $1 FOR UPDATE`, [input.quoteId]);
      const quote = quoteRes.rows[0];
      if (!quote || quote.customer_id !== input.userId) throw new DomainError("NOT_FOUND", "Quote not found");
      if (new Date(quote.expires_at).getTime() < now.getTime()) throw new DomainError("QUOTE_EXPIRED", "Quote expired");
      if (!quote.delivery_address_id) throw new DomainError("VALIDATION_ERROR", "A saved delivery address is required for corporate orders");

      const accountRes = await client.query(
        `SELECT a.*, e.cost_center_code
           FROM corporate_employees e JOIN corporate_accounts a ON a.id = e.corporate_account_id
          WHERE e.user_id = $1 AND e.corporate_account_id = $2 AND e.is_active AND a.is_active
          FOR UPDATE OF a, e`,
        [input.userId, input.corporateAccountId]
      );
      const account = accountRes.rows[0];
      if (!account) throw new DomainError("FORBIDDEN", "You are not an active member of this corporate account");

      const breakdown = quote.breakdown_json as QuoteBreakdown;
      const usedRes = await client.query(
        `SELECT COALESCE(SUM(corporate_covered_paise), 0)::int AS used
           FROM orders
          WHERE customer_id = $1 AND corporate_account_id = $2
            AND created_at >= date_trunc('day', NOW())`,
        [input.userId, input.corporateAccountId]
      );
      const split = calculateCorporateSplit({
        orderTotalPaise: breakdown.payablePaise,
        dailyAllowancePaise: account.daily_allowance_per_employee_paise,
        subsidyBp: account.subsidy_percentage_bp,
        managementFeeBp: account.corporate_management_fee_bp,
        alreadyUsedPaise: usedRes.rows[0]?.used ?? 0,
      });
      if (
        account.credit_limit_paise > 0 &&
        account.unbilled_balance_paise + split.corporateBilledPaise > account.credit_limit_paise
      ) {
        throw new DomainError("VALIDATION_ERROR", "This corporate account has reached its credit limit.");
      }

      const orderNumber = generateOrderNumber(now);
      const promisedAt = new Date(now.getTime() + Number(quote.estimated_max_minutes ?? 30) * 60 * 1000);
      const deadline = new Date(now.getTime() + 90 * 1000);
      const orderRes = await client.query(
        `INSERT INTO orders
           (order_number, customer_id, restaurant_id, delivery_address_id, items_json, breakdown_json,
            fulfillment_state, payment_status, payable_paise, delivery_otp, pickup_otp,
            promised_delivery_at, merchant_response_deadline_at, quote_id, acquisition_channel,
            commission_bp_applied, commission_paise, merchant_order_fee_paise, merchant_net_payout_paise,
            order_type, corporate_account_id, corporate_covered_paise, corporate_overage_paise,
            corporate_cost_center_code, drop_point_id, slot_window, slot_cutoff_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'AWAITING_MERCHANT', 'CAPTURED', $7, $8, $9, $10, $11, $12,
                 'CORPORATE_CLUB', 0, 0, 0, $13, 'CORPORATE', $14, $15, $16, $17, $18, $19,
                 $10::timestamptz - interval '30 minutes')
         RETURNING *`,
        [
          orderNumber,
          input.userId,
          quote.restaurant_id,
          quote.delivery_address_id,
          JSON.stringify(quote.items_json),
          JSON.stringify(quote.breakdown_json),
          split.employeePayablePaise,
          generateVerificationOtp(4),
          generateVerificationOtp(4),
          promisedAt.toISOString(),
          deadline.toISOString(),
          quote.id,
          breakdown.subtotalPaise + breakdown.packagingPaise,
          account.id,
          split.coveredPaise,
          split.overagePaise,
          account.cost_center_code,
          account.drop_point_id,
          quote.slot_window ?? null,
        ]
      );
      const order = orderRes.rows[0];

      let paymentId: string | null = null;
      if (split.employeePayablePaise > 0) {
        const paymentRes = await client.query(
          `INSERT INTO payments (id, order_id, provider_payment_id, status, amount_paise, currency)
           VALUES (gen_random_uuid(), $1, $2, 'CAPTURED', $3, 'INR') RETURNING id`,
          [order.id, `CORPORATE:${order.id}`, split.employeePayablePaise]
        );
        paymentId = paymentRes.rows[0].id;
      }

      await LedgerRepository.postTransactionWithClient(client, {
        orderId: order.id,
        paymentId: paymentId ?? undefined,
        effectType: "CAPTURE",
        entries: LedgerEngine.buildCorporateOrderCaptureEntries({
          payablePaise: split.employeePayablePaise,
          corporateCoveredPaise: split.coveredPaise,
          subtotalPaise: breakdown.subtotalPaise,
          deliveryFeePaise: breakdown.deliveryFeePaise,
          platformFeePaise: breakdown.platformFeePaise,
          packagingPaise: breakdown.packagingPaise,
          taxPaise: breakdown.taxPaise,
          discountPaise: breakdown.discountPaise,
          surgePaise: breakdown.surgePaise,
          tipPaise: breakdown.tipPaise ?? 0,
        }),
      });
      await client.query(
        `UPDATE corporate_accounts SET unbilled_balance_paise = unbilled_balance_paise + $2, updated_at = NOW() WHERE id = $1`,
        [account.id, split.corporateBilledPaise]
      );
      await client.query(
        `INSERT INTO order_events (id, order_id, sequence, source_state, target_state, actor_type, actor_id, reason)
         VALUES (gen_random_uuid(), $1, 1, 'NONE', 'AWAITING_MERCHANT', 'SYSTEM', $2, 'Corporate lunch order')`,
        [order.id, account.id]
      );
      await OutboxRepository.appendWithClient(client, "order.created", order.id, 1, {
        orderId: order.id,
        orderNumber,
        customerId: input.userId,
        restaurantId: quote.restaurant_id,
        payablePaise: split.employeePayablePaise,
        corporateAccountId: account.id,
      });
      await JobRepository.enqueueWithClient(client, JobKind.MERCHANT_ACCEPTANCE_TIMEOUT, { orderId: order.id }, {
        runAt: deadline,
        dedupeKey: `merchant-timeout:${order.id}`,
      });
      return { order, split, paymentId };
    });
  }

  /**
   * Consolidated B2B invoice grouped by cost centre. Food is SAC 996331;
   * platform management is SAC 998596. One invoice per account per month.
   */
  static async generateMonthlyInvoice(input: { corporateAccountId: string; month?: string }) {
    const month = input.month ?? corporateBillingMonth(new Date());
    const range = monthRange(month);
    return withTransaction(async (client) => {
      const accountRes = await client.query(`SELECT * FROM corporate_accounts WHERE id = $1 FOR UPDATE`, [
        input.corporateAccountId,
      ]);
      const account = accountRes.rows[0];
      if (!account) throw new DomainError("NOT_FOUND", "Corporate account not found");

      const existing = await client.query(
        `SELECT * FROM corporate_invoices WHERE corporate_account_id = $1 AND billing_month = $2`,
        [input.corporateAccountId, month]
      );
      if (existing.rows[0]) return existing.rows[0];

      const rows = await client.query(
        `SELECT COALESCE(corporate_cost_center_code, 'UNASSIGNED') AS cost_center,
                COUNT(*)::int AS orders,
                COALESCE(SUM((breakdown_json->>'subtotalPaise')::int), 0)::int AS food_paise,
                COALESCE(SUM(corporate_covered_paise), 0)::int AS covered_paise,
                COALESCE(SUM(corporate_overage_paise), 0)::int AS overage_paise
           FROM orders
          WHERE corporate_account_id = $1
            AND created_at >= $2 AND created_at < $3
            AND fulfillment_state NOT IN ('CANCELLED', 'DELIVERY_FAILED', 'PENDING_PAYMENT')
          GROUP BY COALESCE(corporate_cost_center_code, 'UNASSIGNED')`,
        [input.corporateAccountId, range.start.toISOString(), range.end.toISOString()]
      );
      const costCenters = rows.rows.map((row) => {
        const managementFeePaise = Math.round(
          (row.covered_paise * account.corporate_management_fee_bp) / 10000
        );
        return {
          costCenterCode: row.cost_center,
          orders: row.orders,
          foodPaise: row.food_paise,
          coveredPaise: row.covered_paise,
          overagePaise: row.overage_paise,
          managementFeePaise,
          totalPaise: row.covered_paise + managementFeePaise,
          hsnSac: { food: "996331", platformManagement: "998596" },
        };
      });
      const totalPaise = costCenters.reduce((sum, row) => sum + row.totalPaise, 0);

      const seqRes = await client.query(
        `INSERT INTO invoice_sequences (financial_year, last_seq) VALUES ($1, 1)
         ON CONFLICT (financial_year) DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
         RETURNING last_seq`,
        [`CORP-${month}`]
      );
      const seq = seqRes.rows[0].last_seq;
      const invoiceNumber = `CORP-${month.replace("-", "")}-${String(seq).padStart(5, "0")}`;
      const data = {
        invoiceNumber,
        issuedAt: new Date().toISOString(),
        billingMonth: month,
        company: { name: account.company_name, gstin: account.gstin, billingAddress: account.billing_address },
        costCenters,
        totalPaise,
      };
      const inserted = await client.query(
        `INSERT INTO corporate_invoices
           (corporate_account_id, billing_month, invoice_number, total_paise, data_json)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.corporateAccountId, month, invoiceNumber, totalPaise, JSON.stringify(data)]
      );
      return inserted.rows[0];
    });
  }
}

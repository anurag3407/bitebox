import { LedgerEngine, LedgerEntry } from "@startup/core";
import { getDbPool } from "../client.js";

import type { PoolClient } from "pg";

export class LedgerRepository {
  static async postTransactionWithClient(
    client: PoolClient,
    input: {
      orderId?: string;
      paymentId?: string;
      refundId?: string;
      effectType: "CAPTURE" | "REFUND" | "PAYOUT" | "MEAL_PASS" | "CAPTAIN" | "ADJUSTMENT" | "INCENTIVE";
      entries: LedgerEntry[];
    }
  ): Promise<string> {
    if (!LedgerEngine.validateBalanced(input.entries)) {
      throw new Error("Cannot post unbalanced ledger transaction");
    }

    const txRes = await client.query(
      `INSERT INTO ledger_transactions (id, order_id, payment_id, refund_id, effect_type)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id`,
      [input.orderId ?? null, input.paymentId ?? null, input.refundId ?? null, input.effectType]
    );
    const transactionId = txRes.rows[0].id;

    for (const entry of input.entries) {
      await client.query(
        `INSERT INTO ledger_entries (id, transaction_id, account, debit_paise, credit_paise, description)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [
          transactionId,
          entry.account,
          entry.debitPaise,
          entry.creditPaise,
          entry.description,
        ]
      );
    }

    return transactionId;
  }

  static async postTransaction(input: {
    orderId?: string;
    paymentId?: string;
    refundId?: string;
    effectType: "CAPTURE" | "REFUND" | "PAYOUT" | "MEAL_PASS" | "CAPTAIN" | "ADJUSTMENT";
    entries: LedgerEntry[];
  }): Promise<string> {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const transactionId = await LedgerRepository.postTransactionWithClient(client, input);
      await client.query("COMMIT");
      return transactionId;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async getAccountBalances(): Promise<
    Array<{ account: string; netDebitPaise: number; netCreditPaise: number }>
  > {
    const pool = getDbPool();
    const res = await pool.query(
      `SELECT account,
              COALESCE(SUM(debit_paise), 0)::bigint as total_debit,
              COALESCE(SUM(credit_paise), 0)::bigint as total_credit
       FROM ledger_entries
       GROUP BY account`
    );

    return res.rows.map((r) => ({
      account: r.account,
      netDebitPaise: Number(r.total_debit),
      netCreditPaise: Number(r.total_credit),
    }));
  }
}

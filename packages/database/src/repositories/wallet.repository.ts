import type { PoolClient } from "pg";
import { LedgerAccountType, DomainError } from "@startup/core";
import { WalletTransactionKind } from "@startup/contracts";
import { getDbPool, withTransaction } from "../client.js";
import { LedgerRepository } from "./ledger.repository.js";

export interface WalletAccountRow {
  userId: string;
  balancePaise: number;
  lifetimeCreditedPaise: number;
  lifetimeSpentPaise: number;
  updatedAt: string;
}

export interface WalletTransactionRow {
  id: string;
  kind: WalletTransactionKind;
  direction: "CREDIT" | "DEBIT";
  amountPaise: number;
  balanceAfterPaise: number;
  referenceType?: string;
  referenceId?: string;
  description: string;
  createdAt: string;
}

export interface WalletSummary {
  account: WalletAccountRow;
  transactions: WalletTransactionRow[];
}

function mapAccount(r: any): WalletAccountRow {
  return {
    userId: r.user_id,
    balancePaise: r.balance_paise,
    lifetimeCreditedPaise: r.lifetime_credited_paise,
    lifetimeSpentPaise: r.lifetime_spent_paise,
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function mapTransaction(r: any): WalletTransactionRow {
  return {
    id: r.id,
    kind: r.kind,
    direction: r.direction,
    amountPaise: r.amount_paise,
    balanceAfterPaise: r.balance_after_paise,
    referenceType: r.reference_type ?? undefined,
    referenceId: r.reference_id ?? undefined,
    description: r.description,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

type Queryable = Pick<PoolClient, "query">;

/**
 * Closed-loop BiteBox Credits. Every mutation happens in the caller's transaction
 * (usually alongside the order/referral state change) and posts double-entry ledger
 * rows so credits are never conjured without an expense or liability counterpart.
 */
export class WalletRepository {
  private static async lockAccount(client: PoolClient, userId: string) {
    await client.query(`INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
    const res = await client.query(`SELECT * FROM wallet_accounts WHERE user_id = $1 FOR UPDATE`, [userId]);
    return mapAccount(res.rows[0]);
  }

  static async getOrCreate(userId: string) {
    return withTransaction(async (client) => {
      const account = await WalletRepository.lockAccount(client, userId);
      return account;
    });
  }

  static async getSummary(userId: string): Promise<WalletSummary> {
    const db = getDbPool();
    const accountRes = await db.query(
      `INSERT INTO wallet_accounts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [userId]
    );
    const txRes = await db.query(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 60`,
      [userId]
    );
    return { account: mapAccount(accountRes.rows[0]), transactions: txRes.rows.map(mapTransaction) };
  }

  /** Idempotent when `referenceId` is supplied: the same event can never credit twice. */
  static async creditWithClient(
    client: PoolClient,
    input: {
      userId: string;
      kind: WalletTransactionKind;
      amountPaise: number;
      referenceType?: string;
      referenceId?: string;
      description: string;
      orderId?: string;
      counterAccount?: LedgerAccountType;
    }
  ): Promise<WalletAccountRow> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new DomainError("VALIDATION_ERROR", "Wallet credit must be a positive amount");
    }
    const account = await WalletRepository.lockAccount(client, input.userId);

    if (input.referenceId) {
      const existing = await client.query(
        `SELECT 1 FROM wallet_transactions WHERE user_id = $1 AND kind = $2 AND reference_id = $3`,
        [input.userId, input.kind, input.referenceId]
      );
      if (existing.rows.length > 0) return account;
    }

    const balanceAfter = account.balancePaise + input.amountPaise;
    await client.query(
      `UPDATE wallet_accounts
          SET balance_paise = $2,
              lifetime_credited_paise = lifetime_credited_paise + $3,
              updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, balanceAfter, input.amountPaise]
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, kind, direction, amount_paise, balance_after_paise, reference_type, reference_id, description)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5, $6, $7)`,
      [
        input.userId,
        input.kind,
        input.amountPaise,
        balanceAfter,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.description,
      ]
    );
    await LedgerRepository.postTransactionWithClient(client, {
      orderId: input.orderId,
      effectType: "ADJUSTMENT",
      entries: [
        {
          account: input.counterAccount ?? LedgerAccountType.GOODWILL_EXPENSE,
          debitPaise: input.amountPaise,
          creditPaise: 0,
          description: input.description,
        },
        {
          account: LedgerAccountType.WALLET_LIABILITY,
          debitPaise: 0,
          creditPaise: input.amountPaise,
          description: `Wallet credit: ${input.userId}`,
        },
      ],
    });
    return { ...account, balancePaise: balanceAfter, lifetimeCreditedPaise: account.lifetimeCreditedPaise + input.amountPaise };
  }

  /**
   * Debits a wallet for an order. The order capture transaction separately debits
   * gateway clearing; this posting moves the liability into that clearing account so
   * the platform's gateway balance is unaffected.
   */
  static async debitForOrderWithClient(
    client: PoolClient,
    input: { userId: string; orderId: string; amountPaise: number; description: string }
  ): Promise<WalletAccountRow> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new DomainError("VALIDATION_ERROR", "Wallet payment must be a positive amount");
    }
    const account = await WalletRepository.lockAccount(client, input.userId);

    const existing = await client.query(
      `SELECT 1 FROM wallet_transactions WHERE user_id = $1 AND kind = 'ORDER_PAYMENT' AND reference_id = $2`,
      [input.userId, input.orderId]
    );
    if (existing.rows.length > 0) return account;
    if (account.balancePaise < input.amountPaise) {
      throw new DomainError("PAYMENT_FAILED", "Your BiteBox Credits balance is too low for this order.");
    }

    const balanceAfter = account.balancePaise - input.amountPaise;
    await client.query(
      `UPDATE wallet_accounts
          SET balance_paise = $2,
              lifetime_spent_paise = lifetime_spent_paise + $3,
              updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, balanceAfter, input.amountPaise]
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, kind, direction, amount_paise, balance_after_paise, reference_type, reference_id, description)
       VALUES ($1, 'ORDER_PAYMENT', 'DEBIT', $2, $3, 'ORDER', $4, $5)`,
      [input.userId, input.amountPaise, balanceAfter, input.orderId, input.description]
    );
    await LedgerRepository.postTransactionWithClient(client, {
      orderId: input.orderId,
      effectType: "ADJUSTMENT",
      entries: [
        {
          account: LedgerAccountType.WALLET_LIABILITY,
          debitPaise: input.amountPaise,
          creditPaise: 0,
          description: "Wallet credits redeemed on order",
        },
        {
          account: LedgerAccountType.GATEWAY_CLEARING,
          debitPaise: 0,
          creditPaise: input.amountPaise,
          description: "Wallet settlement into order clearing",
        },
      ],
    });
    return { ...account, balancePaise: balanceAfter, lifetimeSpentPaise: account.lifetimeSpentPaise + input.amountPaise };
  }

  /** Debits credits for a post-delivery rider tip and records the rider payable. */
  static async payRiderTipWithClient(
    client: PoolClient,
    input: { userId: string; orderId: string; tipId: string; amountPaise: number; description: string }
  ): Promise<WalletAccountRow> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new DomainError("VALIDATION_ERROR", "Tip must be a positive amount");
    }
    const account = await WalletRepository.lockAccount(client, input.userId);
    if (account.balancePaise < input.amountPaise) {
      throw new DomainError("PAYMENT_FAILED", "Not enough BiteBox Credits to add this tip.");
    }
    const balanceAfter = account.balancePaise - input.amountPaise;
    await client.query(
      `UPDATE wallet_accounts
          SET balance_paise = $2, lifetime_spent_paise = lifetime_spent_paise + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, balanceAfter, input.amountPaise]
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, kind, direction, amount_paise, balance_after_paise, reference_type, reference_id, description)
       VALUES ($1, 'RIDER_TIP', 'DEBIT', $2, $3, 'ORDER_TIP', $4, $5)`,
      [input.userId, input.amountPaise, balanceAfter, input.tipId, input.description]
    );
    await LedgerRepository.postTransactionWithClient(client, {
      orderId: input.orderId,
      effectType: "ADJUSTMENT",
      entries: [
        {
          account: LedgerAccountType.WALLET_LIABILITY,
          debitPaise: input.amountPaise,
          creditPaise: 0,
          description: "Wallet credits redeemed as a rider tip",
        },
        {
          account: LedgerAccountType.RIDER_PAYABLE,
          debitPaise: 0,
          creditPaise: input.amountPaise,
          description: "Rider tip payable",
        },
      ],
    });
    return { ...account, balancePaise: balanceAfter, lifetimeSpentPaise: account.lifetimeSpentPaise + input.amountPaise };
  }

  /** Refunds a wallet-paid order back to the wallet (used when a wallet order is cancelled). */
  static async refundOrderWithClient(
    client: PoolClient,
    input: { userId: string; orderId: string; amountPaise: number; description: string }
  ): Promise<WalletAccountRow> {
    return WalletRepository.creditWithClient(client, {
      userId: input.userId,
      kind: WalletTransactionKind.REFUND_CREDIT,
      amountPaise: input.amountPaise,
      referenceType: "ORDER_REFUND",
      referenceId: input.orderId,
      description: input.description,
      orderId: input.orderId,
    });
  }

  static async postGoodwillCredit(
    client: PoolClient,
    input: { userId: string; orderId: string; issueId: string; amountPaise: number; description: string }
  ) {
    return WalletRepository.creditWithClient(client, {
      userId: input.userId,
      kind: WalletTransactionKind.GOODWILL,
      amountPaise: input.amountPaise,
      referenceType: "ORDER_ISSUE",
      referenceId: input.issueId,
      description: input.description,
      orderId: input.orderId,
    });
  }

  /** Debits credits for a non-order purchase (currently meal passes) and retires the wallet liability. */
  static async debitForPurchaseWithClient(
    client: PoolClient,
    input: {
      userId: string;
      amountPaise: number;
      kind: WalletTransactionKind;
      referenceType: string;
      referenceId: string;
      description: string;
      counterAccount?: LedgerAccountType;
    }
  ): Promise<WalletAccountRow> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new DomainError("VALIDATION_ERROR", "Purchase amount must be positive");
    }
    const account = await WalletRepository.lockAccount(client, input.userId);
    const existing = await client.query(
      `SELECT 1 FROM wallet_transactions WHERE user_id = $1 AND kind = $2 AND reference_id = $3`,
      [input.userId, input.kind, input.referenceId]
    );
    if (existing.rows.length > 0) return account;
    if (account.balancePaise < input.amountPaise) {
      throw new DomainError("PAYMENT_FAILED", "Not enough BiteBox Credits for this purchase.", {
        details: { balancePaise: account.balancePaise, requiredPaise: input.amountPaise },
      });
    }
    const balanceAfter = account.balancePaise - input.amountPaise;
    await client.query(
      `UPDATE wallet_accounts
          SET balance_paise = $2, lifetime_spent_paise = lifetime_spent_paise + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, balanceAfter, input.amountPaise]
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (user_id, kind, direction, amount_paise, balance_after_paise, reference_type, reference_id, description)
       VALUES ($1, $2, 'DEBIT', $3, $4, $5, $6, $7)`,
      [input.userId, input.kind, input.amountPaise, balanceAfter, input.referenceType, input.referenceId, input.description]
    );
    await LedgerRepository.postTransactionWithClient(client, {
      effectType: "ADJUSTMENT",
      entries: [
        {
          account: LedgerAccountType.WALLET_LIABILITY,
          debitPaise: input.amountPaise,
          creditPaise: 0,
          description: `Wallet credits redeemed: ${input.description}`,
        },
        {
          account: input.counterAccount ?? LedgerAccountType.GATEWAY_CLEARING,
          debitPaise: 0,
          creditPaise: input.amountPaise,
          description: `Wallet settlement: ${input.description}`,
        },
      ],
    });
    return { ...account, balancePaise: balanceAfter, lifetimeSpentPaise: account.lifetimeSpentPaise + input.amountPaise };
  }

  static async totalLiabilityPaise(): Promise<number> {
    const res = await getDbPool().query(`SELECT COALESCE(SUM(balance_paise), 0)::bigint AS total FROM wallet_accounts`);
    return Number(res.rows[0]?.total ?? 0);
  }
}

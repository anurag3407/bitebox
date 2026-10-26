import { randomUUID } from "node:crypto";
import { DomainError, LedgerAccountType } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { WalletRepository } from "./wallet.repository.js";

export interface DonationRow {
  id: string;
  amountPaise: number;
  fund: string;
  receiptCode: string;
  status: string;
  createdAt: string;
}

function mapDonation(r: any): DonationRow {
  return {
    id: r.id,
    amountPaise: r.amount_paise,
    fund: r.fund,
    receiptCode: r.receipt_code,
    status: r.status,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

/** Community-kitchen donations paid from BiteBox Credits into a pass-through liability. */
export class DonationRepository {
  static async give(input: { userId: string; amountPaise: number }): Promise<DonationRow> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 1000 || input.amountPaise > 100000) {
      throw new DomainError("VALIDATION_ERROR", "Donations must be between ₹10 and ₹1,000");
    }
    return withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO donations (user_id, amount_paise, fund, receipt_code)
         VALUES ($1, $2, 'COMMUNITY_KITCHEN', $3) RETURNING *`,
        [input.userId, input.amountPaise, `DON-${randomUUID().slice(0, 8).toUpperCase()}`]
      );
      const donation = res.rows[0];
      await WalletRepository.debitForPurchaseWithClient(client, {
        userId: input.userId,
        amountPaise: input.amountPaise,
        kind: "DONATION",
        referenceType: "DONATION",
        referenceId: donation.id,
        description: `Community kitchen donation ${donation.receipt_code}`,
        counterAccount: LedgerAccountType.DONATION_PAYABLE,
      });
      return mapDonation(donation);
    });
  }

  static async summary(userId: string): Promise<{ totalPaise: number; donations: DonationRow[] }> {
    const [total, recent] = await Promise.all([
      getDbPool().query(`SELECT COALESCE(SUM(amount_paise), 0)::int AS total FROM donations WHERE user_id = $1`, [userId]),
      getDbPool().query(`SELECT * FROM donations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId]),
    ]);
    return { totalPaise: Number(total.rows[0]?.total ?? 0), donations: recent.rows.map(mapDonation) };
  }
}

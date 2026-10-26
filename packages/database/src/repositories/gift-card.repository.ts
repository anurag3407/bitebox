import { randomBytes } from "node:crypto";
import { DomainError, LedgerAccountType } from "@startup/core";
import { getDbPool, withTransaction } from "../client.js";
import { WalletRepository } from "./wallet.repository.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += CODE_ALPHABET.charAt(bytes[i]! % CODE_ALPHABET.length);
  return `BXG-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export interface GiftCardRow {
  id: string;
  code: string;
  purchaserId: string;
  recipientName: string;
  recipientContact?: string;
  message?: string;
  amountPaise: number;
  status: string;
  redeemedBy?: string;
  redeemedAt?: string;
  expiresAt: string;
  createdAt: string;
}

function mapCard(r: any): GiftCardRow {
  return {
    id: r.id,
    code: r.code,
    purchaserId: r.purchaser_id,
    recipientName: r.recipient_name,
    recipientContact: r.recipient_contact ?? undefined,
    message: r.message ?? undefined,
    amountPaise: r.amount_paise,
    status: r.status,
    redeemedBy: r.redeemed_by ?? undefined,
    redeemedAt: r.redeemed_at ? (r.redeemed_at as Date).toISOString() : undefined,
    expiresAt: (r.expires_at as Date).toISOString(),
    createdAt: (r.created_at as Date).toISOString(),
  };
}

/** Prepaid BiteBox gift cards; the balance lives in GIFT_CARD_LIABILITY until redeemed. */
export class GiftCardRepository {
  static async purchase(input: {
    purchaserId: string;
    amountPaise: number;
    recipientName: string;
    recipientContact?: string;
    message?: string;
  }): Promise<GiftCardRow> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 10000 || input.amountPaise > 1000000) {
      throw new DomainError("VALIDATION_ERROR", "Gift cards must be between ₹100 and ₹10,000");
    }
    if (input.recipientName.trim().length < 2) {
      throw new DomainError("VALIDATION_ERROR", "Add the recipient's name");
    }
    return withTransaction(async (client) => {
      let card: any = null;
      for (let attempt = 0; attempt < 5 && !card; attempt += 1) {
        try {
          const res = await client.query(
            `INSERT INTO gift_cards
               (code, purchaser_id, recipient_name, recipient_contact, message, amount_paise, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW() + interval '365 days')
             RETURNING *`,
            [
              generateCode(),
              input.purchaserId,
              input.recipientName.trim(),
              input.recipientContact?.trim() || null,
              input.message?.trim() || null,
              input.amountPaise,
            ]
          );
          card = res.rows[0];
        } catch (err) {
          if ((err as { code?: string }).code !== "23505" || attempt === 4) throw err;
        }
      }
      if (!card) throw new DomainError("INTERNAL_ERROR", "Could not issue the gift card");
      await WalletRepository.debitForPurchaseWithClient(client, {
        userId: input.purchaserId,
        amountPaise: input.amountPaise,
        kind: "GIFT_CARD_PURCHASE",
        referenceType: "GIFT_CARD",
        referenceId: card.id,
        description: `Gift card ${card.code} for ${input.recipientName.trim()}`,
        counterAccount: LedgerAccountType.GIFT_CARD_LIABILITY,
      });
      return mapCard(card);
    });
  }

  static async listForUser(userId: string): Promise<GiftCardRow[]> {
    const res = await getDbPool().query(
      `SELECT * FROM gift_cards WHERE purchaser_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    const now = Date.now();
    return res.rows.map((row) => {
      const card = mapCard(row);
      if (card.status === "ACTIVE" && new Date(card.expiresAt).getTime() <= now) return { ...card, status: "EXPIRED" };
      return card;
    });
  }

  static async redeem(input: { userId: string; code: string }): Promise<{ card: GiftCardRow; balancePaise: number }> {
    const code = input.code.trim().toUpperCase();
    if (!code) throw new DomainError("VALIDATION_ERROR", "Enter a gift card code");
    return withTransaction(async (client) => {
      const res = await client.query(`SELECT * FROM gift_cards WHERE code = $1 FOR UPDATE`, [code]);
      const row = res.rows[0];
      if (!row) throw new DomainError("NOT_FOUND", "Gift card not found");
      if (row.purchaser_id === input.userId) {
        throw new DomainError("FORBIDDEN", "You can't redeem a gift card you bought yourself");
      }
      if (row.status === "REDEEMED") throw new DomainError("STATE_CONFLICT", "This gift card has already been redeemed");
      if (row.status !== "ACTIVE") throw new DomainError("STATE_CONFLICT", "This gift card is no longer active");
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE gift_cards SET status = 'EXPIRED' WHERE id = $1`, [row.id]);
        throw new DomainError("STATE_CONFLICT", "This gift card has expired");
      }
      const account = await WalletRepository.creditWithClient(client, {
        userId: input.userId,
        kind: "GIFT_CARD_REDEEM",
        amountPaise: row.amount_paise,
        referenceType: "GIFT_CARD",
        referenceId: row.id,
        description: `Gift card ${row.code} redeemed`,
        counterAccount: LedgerAccountType.GIFT_CARD_LIABILITY,
      });
      const updated = await client.query(
        `UPDATE gift_cards SET status = 'REDEEMED', redeemed_by = $2, redeemed_at = NOW()
          WHERE id = $1 RETURNING *`,
        [row.id, input.userId]
      );
      return { card: mapCard(updated.rows[0]), balancePaise: account.balancePaise };
    });
  }
}

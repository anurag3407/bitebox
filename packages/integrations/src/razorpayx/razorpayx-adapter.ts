import crypto from "node:crypto";
import { getRazorpayKeyId, getServerEnv, isMockSecret } from "@startup/config";
import { fetchWithTimeout, ProviderRejectedError, ProviderUnavailableError } from "../shared/http.js";

export type RazorpayXPayoutStatus = "queued" | "pending" | "processing" | "processed" | "reversed" | "failed" | "rejected" | "cancelled";

export interface RazorpayXPayout {
  id: string;
  status: RazorpayXPayoutStatus;
  utr: string | null;
  failureReason?: string;
}

/**
 * RazorpayX payouts to partner bank accounts. `isEnabled` is false when no RazorpayX
 * current account is configured; callers then fall back to manual bank transfers.
 */
export class RazorpayXAdapter {
  private readonly keyId = getRazorpayKeyId();
  private readonly secret = getServerEnv().RAZORPAY_KEY_SECRET;
  private readonly accountNumber = getServerEnv().RAZORPAYX_ACCOUNT_NUMBER;

  get isMock(): boolean {
    return isMockSecret(this.secret);
  }

  get isEnabled(): boolean {
    return this.isMock || !!this.accountNumber;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.secret}`).toString("base64")}`,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: 10_000,
      });
    } catch (err) {
      throw new ProviderUnavailableError("RazorpayX", err);
    }
    if (res.status >= 500) throw new ProviderUnavailableError("RazorpayX", new Error(`HTTP ${res.status}`));
    if (!res.ok) throw new ProviderRejectedError("RazorpayX", res.status, await res.text());
    return (await res.json()) as T;
  }

  async ensureFundAccount(input: {
    referenceId: string;
    name: string;
    type: "vendor" | "employee";
    ifsc: string;
    accountNumber: string;
  }): Promise<{ contactId: string; fundAccountId: string }> {
    if (this.isMock) return { contactId: `cont_${input.referenceId.slice(0, 8)}`, fundAccountId: `fa_${crypto.randomBytes(6).toString("hex")}` };
    const contact = await this.call<{ id: string }>("POST", "/contacts", {
      name: input.name.slice(0, 50),
      type: input.type,
      reference_id: input.referenceId,
    });
    const fundAccount = await this.call<{ id: string }>("POST", "/fund_accounts", {
      contact_id: contact.id,
      account_type: "bank_account",
      bank_account: { name: input.name.slice(0, 50), ifsc: input.ifsc, account_number: input.accountNumber },
    });
    return { contactId: contact.id, fundAccountId: fundAccount.id };
  }

  /** Idempotent on `idempotencyKey` (our payout id): retries never pay twice. */
  async createPayout(input: { fundAccountId: string; amountPaise: number; idempotencyKey: string; narration: string }): Promise<RazorpayXPayout> {
    if (this.isMock) return { id: `pout_${crypto.randomBytes(7).toString("hex")}`, status: "processed", utr: `MOCKUTR${Date.now()}` };
    const payout = await this.call<{ id: string; status: RazorpayXPayoutStatus; utr: string | null; status_details?: { description?: string } }>(
      "POST",
      "/payouts",
      {
        account_number: this.accountNumber,
        fund_account_id: input.fundAccountId,
        amount: input.amountPaise,
        currency: "INR",
        mode: input.amountPaise > 50_000_000 ? "NEFT" : "IMPS",
        purpose: "payout",
        queue_if_low_balance: true,
        reference_id: input.idempotencyKey.slice(0, 40),
        narration: input.narration.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 30),
      },
      { "X-Payout-Idempotency": input.idempotencyKey }
    );
    return { id: payout.id, status: payout.status, utr: payout.utr, failureReason: payout.status_details?.description };
  }

  async fetchPayout(payoutId: string): Promise<RazorpayXPayout> {
    const payout = await this.call<{ id: string; status: RazorpayXPayoutStatus; utr: string | null; status_details?: { description?: string } }>(
      "GET",
      `/payouts/${encodeURIComponent(payoutId)}`
    );
    return { id: payout.id, status: payout.status, utr: payout.utr, failureReason: payout.status_details?.description };
  }
}

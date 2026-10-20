import crypto from "node:crypto";
import { getRazorpayKeyId, getServerEnv, isMockSecret } from "@startup/config";
import { fetchWithTimeout, ProviderRejectedError, ProviderUnavailableError } from "../shared/http.js";

export interface CreateRazorpayOrderInput {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  orderId: string | null;
  status: "created" | "authorized" | "captured" | "refunded" | "failed" | string;
  amountPaise: number;
  currency: string;
  errorDescription?: string;
}

export interface RazorpayRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  status: "pending" | "processed" | "failed" | string;
  receipt: string | null;
}

const API_BASE = "https://api.razorpay.com/v1";
// Signature the simulated (no credentials) checkout sends; only honoured in mock mode
export const SIMULATED_PAYMENT_SIGNATURE = "mock_valid_sig_verification_token";

function mapPayment(p: any): RazorpayPayment {
  return {
    id: p.id,
    orderId: p.order_id ?? null,
    status: p.status,
    amountPaise: p.amount,
    currency: p.currency,
    errorDescription: p.error_description ?? undefined,
  };
}

function mapRefund(r: any): RazorpayRefund {
  return { id: r.id, paymentId: r.payment_id, amountPaise: r.amount, status: r.status, receipt: r.receipt ?? null };
}

export class RazorpayAdapter {
  private secret: string;
  private keyId: string;

  constructor(secret?: string, keyId?: string) {
    this.secret = secret || getServerEnv().RAZORPAY_KEY_SECRET;
    this.keyId = keyId || getRazorpayKeyId();
  }

  /** True when running without real credentials (local/dev/test only; strict envs refuse mock secrets). */
  get isMock(): boolean {
    return isMockSecret(this.secret);
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.secret}`).toString("base64");
    let res: Response;
    try {
      res = await fetchWithTimeout(`${API_BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: 10_000,
      });
    } catch (err) {
      throw new ProviderUnavailableError("Razorpay", err);
    }
    if (res.status >= 500) throw new ProviderUnavailableError("Razorpay", new Error(`HTTP ${res.status}`));
    if (!res.ok) throw new ProviderRejectedError("Razorpay", res.status, await res.text());
    return (await res.json()) as T;
  }

  /**
   * Creates a Razorpay order. In mock mode generates a provider-shaped id so the
   * rest of the flow can be exercised locally.
   */
  async createOrder(input: CreateRazorpayOrderInput): Promise<RazorpayOrderResult> {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) {
      // Razorpay's minimum charge is ₹1
      throw new Error("Payable amount must be at least ₹1");
    }
    if (this.isMock) {
      return {
        id: `order_${crypto.randomBytes(8).toString("hex")}`,
        amountPaise: input.amountPaise,
        currency: input.currency ?? "INR",
        status: "created",
      };
    }

    const data = await this.call<any>("POST", "/orders", {
      amount: input.amountPaise,
      currency: input.currency ?? "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return { id: data.id, amountPaise: data.amount, currency: data.currency, status: data.status };
  }

  /**
   * Verifies the checkout callback signature: HMAC-SHA256(orderId + "|" + paymentId, secret).
   */
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    if (this.isMock && input.signature === SIMULATED_PAYMENT_SIGNATURE) {
      return true;
    }

    const expected = crypto.createHmac("sha256", this.secret).update(`${input.orderId}|${input.paymentId}`).digest("hex");
    const given = Buffer.from(input.signature, "utf-8");
    const want = Buffer.from(expected, "utf-8");
    return given.length === want.length && crypto.timingSafeEqual(given, want);
  }

  /**
   * Verifies webhook raw body HMAC-SHA256 signature
   */
  verifyWebhookSignature(rawBody: string, signature: string, webhookSecret?: string): boolean {
    const secret = webhookSecret || getServerEnv().RAZORPAY_WEBHOOK_SECRET;
    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(signature, "utf-8"), Buffer.from(expectedSignature, "utf-8"));
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    return mapPayment(await this.call<any>("GET", `/payments/${encodeURIComponent(paymentId)}`));
  }

  /** Captures an authorized payment (needed when auto-capture is disabled on the account). */
  async capturePayment(paymentId: string, amountPaise: number, currency = "INR"): Promise<RazorpayPayment> {
    return mapPayment(
      await this.call<any>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency })
    );
  }

  async fetchOrderPayments(razorpayOrderId: string): Promise<RazorpayPayment[]> {
    if (this.isMock) return [];
    const data = await this.call<{ items: any[] }>("GET", `/orders/${encodeURIComponent(razorpayOrderId)}/payments`);
    return (data.items ?? []).map(mapPayment);
  }

  /**
   * Issues a refund. `receipt` (our refund id) makes retries detectable: callers first
   * look for an existing refund with the same receipt before calling this again.
   */
  async createRefund(input: {
    paymentId: string;
    amountPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayRefund> {
    if (this.isMock) {
      return {
        id: `rfnd_${crypto.randomBytes(7).toString("hex")}`,
        paymentId: input.paymentId,
        amountPaise: input.amountPaise,
        status: "processed",
        receipt: input.receipt,
      };
    }
    return mapRefund(
      await this.call<any>("POST", `/payments/${encodeURIComponent(input.paymentId)}/refund`, {
        amount: input.amountPaise,
        speed: "normal",
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      })
    );
  }

  async listRefunds(paymentId: string): Promise<RazorpayRefund[]> {
    if (this.isMock) return [];
    const data = await this.call<{ items: any[] }>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds?count=100`);
    return (data.items ?? []).map(mapRefund);
  }

  async fetchRefund(paymentId: string, refundId: string): Promise<RazorpayRefund> {
    return mapRefund(
      await this.call<any>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`)
    );
  }
}

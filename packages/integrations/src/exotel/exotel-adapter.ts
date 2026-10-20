import { getServerEnv } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

/**
 * Exotel "click to call": Exotel rings `from` first, then bridges to `to`.
 * Both parties only ever see the virtual ExoPhone number, never each other's.
 */
export class ExotelAdapter {
  private readonly env = getServerEnv();

  get isEnabled(): boolean {
    const e = this.env;
    return !!(e.EXOTEL_SID && e.EXOTEL_API_KEY && e.EXOTEL_API_TOKEN && e.EXOTEL_CALLER_ID);
  }

  async connect(input: { from: string; to: string; maxDurationSeconds?: number }): Promise<{ ok: boolean; callId?: string; error?: string }> {
    const e = this.env;
    if (!this.isEnabled) return { ok: false, error: "Telephony is not configured" };
    try {
      const res = await fetchWithTimeout(
        `https://${e.EXOTEL_SUBDOMAIN}/v1/Accounts/${encodeURIComponent(e.EXOTEL_SID!)}/Calls/connect.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${e.EXOTEL_API_KEY}:${e.EXOTEL_API_TOKEN}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: input.from,
            To: input.to,
            CallerId: e.EXOTEL_CALLER_ID!,
            TimeLimit: String(input.maxDurationSeconds ?? 600),
            TimeOut: "30",
            Record: "false",
          }).toString(),
          timeoutMs: 8000,
        }
      );
      const data = (await res.json().catch(() => ({}))) as { Call?: { Sid?: string }; RestException?: { Message?: string } };
      return res.ok ? { ok: true, callId: data.Call?.Sid } : { ok: false, error: data.RestException?.Message ?? `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

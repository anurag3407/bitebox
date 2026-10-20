import { getServerEnv, isMockSecret } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

export interface SendSmsInput {
  phone: string;
  message: string;
  templateId?: string;
}

export interface SendSmsResult {
  success: boolean;
  messageId: string;
  error?: string;
}

export class Fast2SmsAdapter {
  private apiKey: string;
  // Captured in mock mode so tests can assert on outgoing messages
  public sentMessages: SendSmsInput[] = [];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getServerEnv().FAST2SMS_API_KEY || "";
  }

  get isMock(): boolean {
    return isMockSecret(this.apiKey);
  }

  static normalizeIndianNumber(phone: string): string | null {
    const digits = phone.replace(/\D/g, "");
    const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    return /^[6-9]\d{9}$/.test(local) ? local : null;
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const number = Fast2SmsAdapter.normalizeIndianNumber(input.phone);
    if (!number) return { success: false, messageId: "", error: "Invalid Indian mobile number" };

    if (this.isMock) {
      this.sentMessages.push(input);
      return { success: true, messageId: `msg_${Date.now()}` };
    }

    try {
      // DLT route requires a registered template; quick-SMS route is for transactional text without one
      const res = await fetchWithTimeout("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: { authorization: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(
          input.templateId
            ? { route: "dlt", sender_id: getServerEnv().FAST2SMS_SENDER_ID, message: input.templateId, variables_values: input.message, numbers: number }
            : { route: "q", message: input.message, numbers: number, flash: 0 }
        ),
        timeoutMs: 5000,
      });
      const data = (await res.json().catch(() => ({}))) as { return?: boolean; request_id?: string; message?: unknown };
      return {
        success: data.return === true,
        messageId: data.request_id ?? "",
        error: data.return === true ? undefined : JSON.stringify(data.message ?? res.status),
      };
    } catch (err) {
      return { success: false, messageId: "", error: (err as Error).message };
    }
  }

  async sendVerificationOtp(phone: string, otp: string): Promise<boolean> {
    const message = `Your Food Delivery verification code is: ${otp}. Valid for 10 minutes.`;
    const res = await this.sendSms({ phone, message });
    return res.success;
  }
}

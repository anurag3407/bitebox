import { getServerEnv, isMockSecret } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

export interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export class BrevoEmailAdapter {
  private apiKey: string;
  // Captured in mock mode so tests can assert on outgoing mail
  public sentEmails: SendEmailInput[] = [];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getServerEnv().BREVO_API_KEY || "";
  }

  get isMock(): boolean {
    return isMockSecret(this.apiKey);
  }

  async sendEmail(input: SendEmailInput): Promise<{ success: boolean; messageId: string; error?: string }> {
    if (this.isMock) {
      this.sentEmails.push(input);
      return { success: true, messageId: `email_${Date.now()}` };
    }

    const env = getServerEnv();
    try {
      const res = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
          to: [{ email: input.toEmail, name: input.toName ?? input.toEmail }],
          subject: input.subject,
          htmlContent: input.htmlContent,
          textContent: input.textContent,
        }),
        timeoutMs: 8000,
      });
      const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
      return { success: res.ok, messageId: data.messageId ?? "", error: res.ok ? undefined : data.message ?? String(res.status) };
    } catch (err) {
      return { success: false, messageId: "", error: (err as Error).message };
    }
  }
}

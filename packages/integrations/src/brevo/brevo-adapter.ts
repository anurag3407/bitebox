import { getServerEnv } from "@startup/config";

export interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export class BrevoEmailAdapter {
  private apiKey: string;
  public sentEmails: SendEmailInput[] = [];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getServerEnv().BREVO_API_KEY;
  }

  async sendEmail(input: SendEmailInput): Promise<{ success: boolean; messageId: string }> {
    const isMock = !this.apiKey || this.apiKey.startsWith("mock");
    this.sentEmails.push(input);

    if (isMock) {
      return {
        success: true,
        messageId: `email_${Date.now()}`,
      };
    }

    const env = getServerEnv();
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: env.BREVO_SENDER_NAME,
          email: env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: input.toEmail, name: input.toName ?? input.toEmail }],
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
      }),
    });

    const data = await res.json();
    return {
      success: res.ok,
      messageId: data.messageId || `msg_${Date.now()}`,
    };
  }
}

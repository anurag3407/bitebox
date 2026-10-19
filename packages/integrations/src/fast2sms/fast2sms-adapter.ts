import { getServerEnv } from "@startup/config";

export interface SendSmsInput {
  phone: string;
  message: string;
  templateId?: string;
}

export class Fast2SmsAdapter {
  private apiKey: string;
  public sentMessages: SendSmsInput[] = [];

  constructor(apiKey?: string) {
    this.apiKey = apiKey || getServerEnv().FAST2SMS_API_KEY;
  }

  async sendSms(input: SendSmsInput): Promise<{ success: boolean; messageId: string }> {
    const isMock = !this.apiKey || this.apiKey.startsWith("mock");

    this.sentMessages.push(input);

    if (isMock) {
      return {
        success: true,
        messageId: `msg_${Date.now()}`,
      };
    }

    // Live Fast2SMS endpoint invocation
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "dlt",
        sender_id: getServerEnv().FAST2SMS_SENDER_ID,
        message: input.message,
        flash: 0,
        numbers: input.phone.replace(/\D/g, "").slice(-10),
      }),
    });

    const data = await res.json();
    return {
      success: data.return === true,
      messageId: data.request_id || `req_${Date.now()}`,
    };
  }

  async sendVerificationOtp(phone: string, otp: string): Promise<boolean> {
    const message = `Your Food Delivery verification code is: ${otp}. Valid for 10 minutes.`;
    const res = await this.sendSms({ phone, message });
    return res.success;
  }
}

import webpush from "web-push";
import { getServerEnv } from "@startup/config";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  // Path opened when the notification is tapped
  url?: string;
  // Notifications with the same tag replace each other (one live card per order)
  tag?: string;
  requireInteraction?: boolean;
}

export type PushResult = "SENT" | "GONE" | "FAILED" | "DISABLED";

/** Web Push (VAPID) for PWA notifications: order updates, new orders, rider offers. */
export class WebPushAdapter {
  private configured = false;
  public sent: Array<{ target: PushTarget; message: PushMessage }> = [];

  constructor() {
    const env = getServerEnv();
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      this.configured = true;
    }
  }

  get isEnabled(): boolean {
    return this.configured;
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (!this.configured) {
      this.sent.push({ target, message });
      return "DISABLED";
    }
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        { TTL: 60 * 30, urgency: "high", timeout: 5000 }
      );
      return "SENT";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The browser unsubscribed or the subscription expired: the caller should forget it
      return status === 404 || status === 410 ? "GONE" : "FAILED";
    }
  }
}

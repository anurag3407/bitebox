import { getServerEnv } from "@startup/config";
import { ClaimedOutboxEvent, PushSubscriptionRepository, UserRepository, getDbPool } from "@startup/database";
import { BrevoEmailAdapter, Fast2SmsAdapter, PushMessage, WebPushAdapter } from "@startup/integrations";
import { logger } from "./logger.js";

const rupees = (paise: number) => `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

interface OrderContext {
  orderId: string;
  orderNumber: string;
  customerId: string;
  restaurantId: string;
  restaurantName: string;
  payablePaise: number;
  refundedPaise: number;
  contactPhone: string | null;
}

/**
 * Turns outbox events into customer / merchant / rider / ops notifications.
 * Every channel is best-effort: a failed SMS must not block a push, and nothing
 * here may throw for a delivery failure (the event would be retried and the
 * customer spammed). Only infrastructure errors (DB) propagate for retry.
 */
export class NotificationService {
  constructor(
    private readonly push = new WebPushAdapter(),
    private readonly sms = new Fast2SmsAdapter(),
    private readonly email = new BrevoEmailAdapter()
  ) {}

  get adapters() {
    return { push: this.push, sms: this.sms, email: this.email };
  }

  private async loadOrder(orderId: string): Promise<OrderContext | null> {
    const res = await getDbPool().query(
      `SELECT o.id, o.order_number, o.customer_id, o.restaurant_id, o.payable_paise, o.refunded_paise,
              r.name AS restaurant_name,
              COALESCE(o.delivery_address_snapshot->>'contactPhone', a.contact_phone, u.phone) AS contact_phone
         FROM orders o
         JOIN restaurants r ON r.id = o.restaurant_id
         JOIN customer_addresses a ON a.id = o.delivery_address_id
         JOIN app_users u ON u.id = o.customer_id
        WHERE o.id = $1`,
      [orderId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      orderId: r.id,
      orderNumber: r.order_number,
      customerId: r.customer_id,
      restaurantId: r.restaurant_id,
      restaurantName: r.restaurant_name,
      payablePaise: r.payable_paise,
      refundedPaise: r.refunded_paise,
      contactPhone: r.contact_phone,
    };
  }

  private async pushToUser(userId: string, message: PushMessage): Promise<void> {
    const subs = await PushSubscriptionRepository.listForUser(userId);
    await Promise.all(
      subs.map(async (sub) => {
        const result = await this.push.send(sub, message);
        if (result === "SENT") await PushSubscriptionRepository.markSuccess(sub.id);
        if (result === "GONE") await PushSubscriptionRepository.deleteById(sub.id);
      })
    );
  }

  private async pushToRestaurantStaff(restaurantId: string, message: PushMessage): Promise<void> {
    const res = await getDbPool().query(
      `SELECT user_id FROM merchant_memberships WHERE restaurant_id = $1 AND is_active`,
      [restaurantId]
    );
    await Promise.all(res.rows.map((r) => this.pushToUser(r.user_id, message)));
  }

  private async pushToRider(riderId: string, message: PushMessage): Promise<void> {
    const res = await getDbPool().query(`SELECT user_id FROM riders WHERE id = $1`, [riderId]);
    if (res.rows[0]) await this.pushToUser(res.rows[0].user_id, message);
  }

  private async smsCustomer(order: OrderContext, message: string): Promise<void> {
    if (!order.contactPhone) return;
    const result = await this.sms.sendSms({ phone: order.contactPhone, message });
    if (!result.success) logger.warn("sms delivery failed", { orderId: order.orderId, error: result.error });
  }

  private async alertOps(subject: string, body: Record<string, unknown>): Promise<void> {
    logger.warn(`OPS ALERT: ${subject}`, body);
    const to = getServerEnv().OPS_ALERT_EMAIL;
    if (!to) return;
    await this.email.sendEmail({
      toEmail: to,
      subject: `[Ops] ${subject}`,
      htmlContent: `<pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`,
      textContent: JSON.stringify(body, null, 2),
    });
  }

  async handle(event: ClaimedOutboxEvent): Promise<void> {
    const p = event.payload as Record<string, any>;
    const orderId = (p.orderId as string | undefined) ?? event.aggregateId;
    const orderUrl = `/orders/${orderId}`;

    switch (event.eventType) {
      case "order.awaiting_merchant": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        await Promise.all([
          this.pushToRestaurantStaff(order.restaurantId, {
            title: `New order ${order.orderNumber}`,
            body: `${rupees(order.payablePaise)} — accept within 90 seconds`,
            url: "/merchant",
            tag: `merchant-${order.orderId}`,
            requireInteraction: true,
          }),
          this.pushToUser(order.customerId, {
            title: "Order placed",
            body: `Waiting for ${order.restaurantName} to confirm your order.`,
            url: orderUrl,
            tag: `order-${order.orderId}`,
          }),
        ]);
        return;
      }

      case "order.accepted":
      case "order.preparing":
      case "order.ready_for_pickup":
      case "order.out_for_delivery":
      case "order.delivered": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        const copy: Record<string, { title: string; body: string }> = {
          "order.accepted": { title: "Order confirmed", body: `${order.restaurantName} is preparing your food.` },
          "order.preparing": { title: "Being prepared", body: `${order.restaurantName} has started cooking.` },
          "order.ready_for_pickup": { title: "Food is ready", body: "Your order is packed and waiting for the delivery partner." },
          "order.out_for_delivery": { title: "On the way", body: "Your order has been picked up. Keep your delivery OTP handy." },
          "order.delivered": { title: "Delivered. Enjoy your meal!", body: "Tap to rate your order." },
        };
        await this.pushToUser(order.customerId, { ...copy[event.eventType]!, url: orderUrl, tag: `order-${order.orderId}` });

        if (event.eventType === "order.delivered") {
          const contact = await UserRepository.getContact(order.customerId);
          if (contact?.email) {
            const result = await this.email.sendEmail({
              toEmail: contact.email,
              toName: contact.name,
              subject: `Your order ${order.orderNumber} from ${order.restaurantName}`,
              htmlContent: `<p>Hi ${escapeHtml(contact.name)},</p><p>Your order <b>${escapeHtml(order.orderNumber)}</b> from ${escapeHtml(
                order.restaurantName
              )} was delivered. Total paid: <b>${rupees(order.payablePaise)}</b>.</p><p>Thank you for ordering with us!</p>`,
            });
            if (!result.success) logger.warn("receipt email failed", { orderId, error: result.error });
          }
        }
        return;
      }

      case "order.assigned": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        const rider = await getDbPool().query(`SELECT name FROM riders WHERE id = $1`, [p.riderId]);
        await Promise.all([
          this.pushToUser(order.customerId, {
            title: "Delivery partner assigned",
            body: `${rider.rows[0]?.name ?? "Your delivery partner"} will pick up your order.`,
            url: orderUrl,
            tag: `order-${order.orderId}`,
          }),
          this.pushToRider(p.riderId, { title: "Trip assigned", body: `Pick up from ${order.restaurantName}.`, url: "/rider", tag: "rider-trip" }),
        ]);
        return;
      }

      case "dispatch.offer_created": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        await this.pushToRider(p.riderId, {
          title: "New delivery request",
          body: `Pickup at ${order.restaurantName}. Accept before it expires.`,
          url: "/rider",
          tag: "rider-offer",
          requireInteraction: true,
        });
        return;
      }

      case "rider.arrived_dropoff": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        await this.pushToUser(order.customerId, {
          title: "Your delivery partner has arrived",
          body: "Share your delivery OTP to collect the order.",
          url: orderUrl,
          tag: `order-${order.orderId}`,
          requireInteraction: true,
        });
        return;
      }

      case "order.cancelled":
      case "order.delivery_failed": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        // Refund rows are written in the same transaction, so refunded_paise is already final here
        const refundNote = order.refundedPaise > 0 ? ` A refund of ${rupees(order.refundedPaise)} has been initiated.` : "";
        const wasPaid = p.fromState !== "PENDING_PAYMENT";
        await this.pushToUser(order.customerId, {
          title: event.eventType === "order.cancelled" ? "Order cancelled" : "Delivery unsuccessful",
          body: `${order.orderNumber}: ${p.reason ?? "Your order could not be completed."}${refundNote}`,
          url: orderUrl,
          tag: `order-${order.orderId}`,
        });
        if (wasPaid) {
          await this.smsCustomer(order, `Your order ${order.orderNumber} was cancelled.${refundNote}`);
          await this.pushToRestaurantStaff(order.restaurantId, {
            title: `Order ${order.orderNumber} cancelled`,
            body: String(p.reason ?? "Cancelled"),
            url: "/merchant",
            tag: `merchant-${order.orderId}`,
          });
        }
        return;
      }

      case "refund.processed": {
        const order = await this.loadOrder(orderId);
        if (!order) return;
        await this.pushToUser(order.customerId, {
          title: "Refund processed",
          body: `${rupees(Number(p.amountPaise))} for ${order.orderNumber} is on its way to your account (5-7 working days).`,
          url: orderUrl,
          tag: `refund-${p.refundId}`,
        });
        return;
      }

      case "support.agent_replied":
        await this.pushToUser(String(p.customerId), {
          title: "Support replied",
          body: String(p.preview ?? "You have a new message from support"),
          url: `/support/${p.ticketId}`,
          tag: `support-${p.ticketId}`,
        });
        return;

      case "payout.paid": {
        const owner = await getDbPool().query(
          p.ownerType === "MERCHANT" ? `SELECT owner_user_id AS user_id FROM merchants WHERE id = $1` : `SELECT user_id FROM riders WHERE id = $1`,
          [p.ownerId]
        );
        if (owner.rows[0]?.user_id) {
          await this.pushToUser(owner.rows[0].user_id, {
            title: "Payout sent",
            body: `${rupees(Number(p.amountPaise))} has been transferred to your bank account.`,
            url: p.ownerType === "MERCHANT" ? "/merchant?tab=earnings" : "/rider?tab=earnings",
            tag: `payout-${p.payoutId}`,
          });
        }
        return;
      }

      case "payout.failed":
        await this.alertOps("Partner payout failed", p);
        return;

      case "refund.failed":
        await this.alertOps("Refund failed at gateway", p);
        return;
      case "dispatch.escalated":
        await this.alertOps("No delivery partner found", p);
        return;
      case "delivery.otp_locked":
        await this.alertOps("Delivery OTP locked after repeated failures", p);
        return;
      case "payment.anomaly":
        await this.alertOps("Payment anomaly auto-refunded", p);
        return;

      default:
        // Events without subscribers (order.created, order.rated, ...) are simply acknowledged
        return;
    }
  }
}

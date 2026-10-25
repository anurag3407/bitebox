"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, Check, FileText, HelpCircle, RotateCcw, Star, XCircle } from "lucide-react";
import { FulfillmentState } from "@startup/contracts";
import type { TrackingSnapshot } from "@startup/api-client";
import { TrackingMap } from "@/components/tracking/tracking-map";
import { CallButton } from "@/components/support/call-button";
import { HelpSheet } from "@/components/support/help-sheet";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { useCartStore } from "@/features/cart/cart-store";
import { ApiError, errorMessage, useApi } from "@/lib/api";
import { STATE_LABELS, formatDateTime, formatRupees, formatTime } from "@/lib/format";
import { subscribeSse } from "@/lib/sse";

const STEPS: Array<{ state: FulfillmentState; title: string }> = [
  { state: FulfillmentState.AWAITING_MERCHANT, title: "Placed" },
  { state: FulfillmentState.ACCEPTED, title: "Confirmed" },
  { state: FulfillmentState.PREPARING, title: "Preparing" },
  { state: FulfillmentState.OUT_FOR_DELIVERY, title: "On the way" },
  { state: FulfillmentState.DELIVERED, title: "Delivered" },
];
const ORDER: FulfillmentState[] = [
  FulfillmentState.PENDING_PAYMENT,
  FulfillmentState.AWAITING_MERCHANT,
  FulfillmentState.ACCEPTED,
  FulfillmentState.PREPARING,
  FulfillmentState.READY_FOR_PICKUP,
  FulfillmentState.PICKED_UP,
  FulfillmentState.OUT_FOR_DELIVERY,
  FulfillmentState.DELIVERED,
];

/** Index into STEPS of the step currently in progress (or completed, when delivered). */
function activeStep(state: FulfillmentState): number {
  if (state === FulfillmentState.DELIVERED) return 4;
  if (state === FulfillmentState.PICKED_UP || state === FulfillmentState.OUT_FOR_DELIVERY) return 3;
  if (state === FulfillmentState.PREPARING || state === FulfillmentState.READY_FOR_PICKUP) return 2;
  if (state === FulfillmentState.ACCEPTED) return 1;
  return 0;
}

function RatingForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [food, setFood] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const stars = (value: number, set: (v: number) => void, label: string) => (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => set(n)} className="p-1 transition-transform hover:scale-110">
          <Star className={`h-7 w-7 ${n <= value ? "fill-ink text-ink" : "text-line-strong"}`} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!food) return;
        setSaving(true);
        try {
          await api.rateOrder(orderId, { foodRating: food, deliveryRating: delivery || undefined, comment: comment.trim() || undefined });
          toast("Thanks for your feedback", "success");
          onDone();
        } catch (err) {
          toast(errorMessage(err), "error");
        } finally {
          setSaving(false);
        }
      }}
      className="space-y-6"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="label">Food</p>
          {stars(food, setFood, "Food rating")}
        </div>
        <div>
          <p className="label">Delivery</p>
          {stars(delivery, setDelivery, "Delivery rating")}
        </div>
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} placeholder="Anything others should know? (optional)" className="input" />
      <button disabled={!food || saving} className="btn btn-primary">
        {saving && <Spinner />} Submit rating
      </button>
    </form>
  );
}

export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const replaceCart = useCartStore((s) => s.replaceWith);
  const { isSignedIn } = useAuth();
  const [liveStatus, setLiveStatus] = useState<"connecting" | "open" | "retrying" | "closed">("connecting");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const tracking = useQuery({
    queryKey: ["tracking", orderId],
    queryFn: () => api.getOrderTracking(orderId),
    enabled: isSignedIn,
    // Polling is only a fallback when the live stream is down
    refetchInterval: (q) => (q.state.data?.isTerminal || liveStatus === "open" ? false : 10_000),
  });

  useEffect(() => {
    if (!isSignedIn) return;
    return subscribeSse(`/api/v1/orders/${orderId}/live`, {
      getHeaders: () => api.authHeaders(),
      onEvent: (event, data) => {
        if (event === "snapshot") queryClient.setQueryData<TrackingSnapshot>(["tracking", orderId], JSON.parse(data));
      },
      onStatus: setLiveStatus,
    });
  }, [orderId, isSignedIn, api, queryClient]);

  const snapshot = tracking.data;
  if (tracking.isPending) {
    return (
      <div className="page-narrow space-y-6 py-12">
        <div className="h-10 w-2/3 animate-pulse rounded-full bg-subtle" />
        <div className="skeleton h-2" />
        <div className="skeleton aspect-[2/1]" />
      </div>
    );
  }
  if (!snapshot) {
    return (
      <EmptyState
        title={tracking.error instanceof ApiError && tracking.error.status === 404 ? "Order not found" : "Couldn't load your order"}
        body={errorMessage(tracking.error)}
        action={
          <button onClick={() => router.push("/account?tab=orders")} className="btn btn-primary">
            Your orders
          </button>
        }
      />
    );
  }

  const order = snapshot.order;
  const state = order.fulfillmentState;
  const failed = state === FulfillmentState.CANCELLED || state === FulfillmentState.DELIVERY_FAILED;
  const delivered = state === FulfillmentState.DELIVERED;
  const step = activeStep(state);
  const pendingPayment = state === FulfillmentState.PENDING_PAYMENT;

  const reorder = async () => {
    try {
      const data = await api.getReorder(orderId);
      if (data.lines.length === 0) {
        toast("None of these items are available right now.", "error");
        return;
      }
      replaceCart(
        data.lines.map((l) => ({
          ...l,
          restaurantId: data.restaurant.id,
          restaurantName: data.restaurant.name,
          restaurantSlug: data.restaurant.slug,
        }))
      );
      if (data.unavailable.length) toast(`Not available: ${data.unavailable.join(", ")}`);
      router.push("/checkout");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const subtitle = pendingPayment
    ? "We're confirming your payment. This usually takes a few seconds."
    : state === FulfillmentState.AWAITING_MERCHANT
      ? "The restaurant has 90 seconds to confirm. If they can't, you get a full refund."
      : failed
        ? order.cancellationReason
        : delivered && order.deliveredAt
          ? `Delivered at ${formatTime(order.deliveredAt)}. Enjoy your meal.`
          : null;

  return (
    <div className="page-narrow pb-16 pt-8 sm:pt-12">
      <div className="flex items-center justify-between">
        <Link href="/account?tab=orders" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Orders
        </Link>
        {!snapshot.isTerminal && (
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            <span className={`h-2 w-2 rounded-full ${liveStatus === "open" ? "animate-pulse bg-success" : "bg-warn"}`} />
            {liveStatus === "open" ? "Live" : "Reconnecting"}
          </span>
        )}
      </div>

      {/* Status */}
      <header className="mt-6">
        <p className="text-sm text-ink-muted">
          {order.restaurant.name} · #{order.orderNumber}
        </p>
        <div className="mt-2 flex items-end justify-between gap-6">
          <h1 className="h-page flex items-center gap-3">
            {delivered && (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success text-white">
                <Check className="h-5 w-5" />
              </span>
            )}
            {failed && <XCircle className="h-8 w-8 text-danger" />}
            {STATE_LABELS[state] ?? state}
          </h1>
          {!snapshot.isTerminal && !pendingPayment && snapshot.etaMinutes ? (
            <div className="shrink-0 text-right">
              <p className="text-3xl font-semibold tracking-tight text-ink tabular">{snapshot.etaMinutes}</p>
              <p className="text-xs text-ink-muted">min away</p>
            </div>
          ) : null}
        </div>
        {subtitle && <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>}
      </header>

      {!failed && (
        <ol className="mt-8 grid grid-cols-5 gap-1.5" aria-label="Order progress">
          {STEPS.map((s, i) => {
            const at = snapshot.timeline.find((t) => t.state === s.state)?.at;
            const done = i < step || delivered;
            const current = i === step && !delivered && !pendingPayment;
            return (
              <li key={s.state} aria-current={current ? "step" : undefined}>
                <span className={`block h-1.5 rounded-full ${done ? "bg-ink" : current ? "animate-pulse bg-ink/40" : "bg-line"}`} />
                <span className={`mt-2.5 block truncate text-[11px] sm:text-xs ${done || current ? "font-medium text-ink" : "text-ink-muted"}`}>{s.title}</span>
                {at && <span className="hidden text-[11px] text-ink-muted sm:block">{formatTime(at)}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {/* OTP */}
      {!snapshot.isTerminal && order.deliveryOtp && (
        <section className="panel mt-10 flex items-center justify-between gap-6 p-6">
          <div>
            <p className="text-sm font-medium text-ink">Delivery code</p>
            <p className="mt-1 text-xs text-ink-muted">Share only once you have your food.</p>
          </div>
          <p className="text-3xl font-semibold tracking-[0.25em] text-ink tabular">{order.deliveryOtp}</p>
        </section>
      )}

      {/* Map + rider */}
      {!failed && !delivered && (
        <section className="mt-6 space-y-5">
          <TrackingMap restaurant={snapshot.restaurantLocation} home={order.deliveryAddress} rider={snapshot.rider?.location} riderStale={snapshot.rider?.isStale} />
          {snapshot.rider ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle">
                  <Bike className="h-5 w-5 text-ink" />
                </span>
                <div>
                  <p className="font-medium text-ink">{snapshot.rider.name}</p>
                  <p className="text-sm text-ink-muted">{snapshot.rider.isStale ? "Location updating…" : "Your delivery partner"}</p>
                </div>
              </div>
              {!snapshot.isTerminal && snapshot.rider.tripStatus !== "COMPLETED" && <CallButton orderId={orderId} target="RIDER" label="Call" />}
            </div>
          ) : (
            !snapshot.isTerminal && <p className="text-sm text-ink-muted">We&apos;ll assign a delivery partner as your food nears ready.</p>
          )}
        </section>
      )}

      {failed && (
        <p className="notice notice-neutral mt-8">
          {(order.refundedPaise ?? 0) > 0
            ? `${formatRupees(order.refundedPaise!)} is being refunded to your original payment method. It usually arrives in 5–7 working days.`
            : order.paymentStatus === "PENDING"
              ? "You were not charged for this order."
              : "Contact support if you believe you're owed a refund."}
        </p>
      )}

      {/* Actions */}
      <div className="mt-10 flex flex-wrap gap-2">
        {snapshot.isTerminal && (
          <button onClick={reorder} className="btn btn-primary">
            <RotateCcw className="h-4 w-4" /> Reorder
          </button>
        )}
        {!snapshot.isTerminal && <CallButton orderId={orderId} target="RESTAURANT" label="Call restaurant" className="btn btn-outline" />}
        {delivered && (
          <Link href={`/orders/${orderId}/invoice`} className="btn btn-outline">
            <FileText className="h-4 w-4" /> Invoice
          </Link>
        )}
        <button onClick={() => setHelpOpen(true)} className="btn btn-outline">
          <HelpCircle className="h-4 w-4" /> Get help
        </button>
        {order.canCancel && (
          <button onClick={() => setCancelOpen(true)} className="btn btn-danger-ghost">
            Cancel order
          </button>
        )}
      </div>

      {/* Rating */}
      {order.canRate && (
        <section className="mt-14 border-t border-line pt-10">
          <h2 className="h-section">How was it?</h2>
          <p className="mt-1 text-sm text-ink-muted">Your rating helps other people choose.</p>
          <div className="mt-6">
            <RatingForm orderId={orderId} onDone={() => tracking.refetch()} />
          </div>
        </section>
      )}
      {order.rating && (
        <p className="mt-10 flex items-center gap-1.5 text-sm text-ink-muted">
          You rated this order {order.rating.foodRating} <Star className="h-4 w-4 fill-ink text-ink" />
        </p>
      )}

      {/* Receipt */}
      <section className="mt-14 border-t border-line pt-10">
        <h2 className="h-section">Order details</h2>
        <ul className="mt-6 space-y-4">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-4 text-[15px]">
              <span className="min-w-0">
                <span className="text-ink-muted tabular">{i.quantity}×</span> <span className="text-ink">{i.name}</span>
                {(i.variantName || i.selectedOptionNames.length > 0) && (
                  <span className="mt-0.5 block text-sm text-ink-muted">{[i.variantName, ...i.selectedOptionNames].filter(Boolean).join(" · ")}</span>
                )}
              </span>
              <span className="shrink-0 text-ink tabular">{formatRupees(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-3 border-t border-line pt-6 text-sm">
          {order.breakdown.discountPaise > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount {order.couponCode && `· ${order.couponCode}`}</span>
              <span className="tabular">−{formatRupees(order.breakdown.discountPaise)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-ink">
            <span>Total paid</span>
            <span className="tabular">{formatRupees(order.breakdown.payablePaise)}</span>
          </div>
        </div>
        <dl className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Delivering to</dt>
            <dd className="mt-1 text-ink">
              {order.deliveryAddress.building}, {order.deliveryAddress.street}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Placed</dt>
            <dd className="mt-1 text-ink">{formatDateTime(order.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <HelpSheet orderId={orderId} open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        size="sm"
        title="Cancel this order?"
        description={`${order.paymentStatus === "PENDING" ? "You haven't been charged." : "You'll get a full refund to your original payment method."} Once the restaurant accepts, the order can't be cancelled from the app.`}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setCancelOpen(false)} className="btn btn-secondary flex-1">
              Keep order
            </button>
            <button
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                try {
                  await api.cancelOrder(orderId, "Cancelled by customer");
                  toast("Order cancelled", "success");
                  setCancelOpen(false);
                  tracking.refetch();
                } catch (err) {
                  toast(errorMessage(err), "error");
                } finally {
                  setCancelling(false);
                }
              }}
              className="btn btn-danger flex-1"
            >
              {cancelling && <Spinner />} Cancel order
            </button>
          </div>
        }
      />
    </div>
  );
}

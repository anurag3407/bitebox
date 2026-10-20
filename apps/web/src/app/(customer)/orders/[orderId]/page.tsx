"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, CheckCircle2, Clock, FileText, HelpCircle, KeyRound, MapPin, ShieldAlert, Star, Store, RotateCcw } from "lucide-react";
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

const STEPS: Array<{ state: FulfillmentState; title: string; icon: typeof Store }> = [
  { state: FulfillmentState.AWAITING_MERCHANT, title: "Order placed", icon: CheckCircle2 },
  { state: FulfillmentState.ACCEPTED, title: "Restaurant confirmed", icon: Store },
  { state: FulfillmentState.PREPARING, title: "Preparing your food", icon: Clock },
  { state: FulfillmentState.OUT_FOR_DELIVERY, title: "On the way", icon: Bike },
  { state: FulfillmentState.DELIVERED, title: "Delivered", icon: CheckCircle2 },
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
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star`} onClick={() => set(n)}>
          <Star className={`w-7 h-7 ${n <= value ? "fill-amber-400 text-amber-400" : "text-border"}`} />
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
          toast("Thanks for your feedback!", "success");
          onDone();
        } catch (err) {
          toast(errorMessage(err), "error");
        } finally {
          setSaving(false);
        }
      }}
      className="space-y-3"
    >
      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1">How was the food?</p>
        {stars(food, setFood, "Food rating")}
      </div>
      <div>
        <p className="text-xs font-semibold text-text-secondary mb-1">How was the delivery?</p>
        {stars(delivery, setDelivery, "Delivery rating")}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Tell others what you liked (optional)"
        className="w-full p-3 bg-surface-muted border border-border rounded-xl text-sm"
      />
      <button disabled={!food || saving} className="px-5 py-2.5 bg-brand text-white text-sm font-bold rounded-xl disabled:opacity-50">
        {saving ? "Submitting…" : "Submit rating"}
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

  const key = ["tracking", orderId];
  const tracking = useQuery({
    queryKey: key,
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
        if (event === "snapshot") queryClient.setQueryData<TrackingSnapshot>(key, JSON.parse(data));
      },
      onStatus: setLiveStatus,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, isSignedIn, api]);

  const snapshot = tracking.data;
  if (tracking.isPending) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-4 animate-pulse">
        <div className="h-40 bg-surface-muted rounded-3xl" />
        <div className="h-64 bg-surface-muted rounded-3xl" />
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <EmptyState
          title={tracking.error instanceof ApiError && tracking.error.status === 404 ? "Order not found" : "Couldn't load your order"}
          body={errorMessage(tracking.error)}
          action={<button onClick={() => router.push("/account?tab=orders")} className="px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl">Your orders</button>}
        />
      </div>
    );
  }

  const order = snapshot.order;
  const state = order.fulfillmentState;
  const failed = state === FulfillmentState.CANCELLED || state === FulfillmentState.DELIVERY_FAILED;
  const delivered = state === FulfillmentState.DELIVERED;
  const currentIdx = ORDER.indexOf(state);

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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/account?tab=orders" className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-brand">
          <ArrowLeft className="w-4 h-4" /> Your orders
        </Link>
        {!snapshot.isTerminal && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
            <span className={`w-2 h-2 rounded-full ${liveStatus === "open" ? "bg-success animate-pulse" : "bg-amber-400"}`} />
            {liveStatus === "open" ? "Live" : "Reconnecting…"}
          </span>
        )}
      </div>

      {/* Status hero */}
      <section className={`rounded-3xl p-6 text-white ${failed ? "bg-text-primary" : delivered ? "bg-success" : "bg-brand"}`}>
        <p className="text-xs font-semibold text-white/80">
          {order.restaurant.name} · #{order.orderNumber}
        </p>
        <h1 className="text-2xl font-black mt-1">{STATE_LABELS[state] ?? state}</h1>
        {!snapshot.isTerminal && snapshot.etaMinutes && state !== FulfillmentState.PENDING_PAYMENT && (
          <p className="text-sm mt-1">Arriving in about {snapshot.etaMinutes} min</p>
        )}
        {state === FulfillmentState.PENDING_PAYMENT && <p className="text-sm mt-1">We&apos;re confirming your payment. This usually takes a few seconds.</p>}
        {state === FulfillmentState.AWAITING_MERCHANT && <p className="text-sm mt-1">The restaurant has 90 seconds to confirm. If they can&apos;t, you get a full refund.</p>}
        {failed && order.cancellationReason && <p className="text-sm mt-1 text-white/90">{order.cancellationReason}</p>}
        {delivered && order.deliveredAt && <p className="text-sm mt-1">Delivered at {formatTime(order.deliveredAt)}</p>}
      </section>

      {/* OTP */}
      {!snapshot.isTerminal && order.deliveryOtp && (
        <section className="bg-brand-light border border-brand/30 p-4 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-brand tracking-wider">Delivery OTP</p>
            <p className="text-2xl font-black text-brand tracking-[0.3em]">{order.deliveryOtp}</p>
            <p className="text-[11px] text-text-secondary">Share only when you have received your order</p>
          </div>
        </section>
      )}

      {/* Map + rider */}
      {!failed && (
        <section className="bg-white rounded-3xl border border-border p-4 space-y-3">
          <TrackingMap
            restaurant={snapshot.restaurantLocation}
            home={order.deliveryAddress}
            rider={snapshot.rider?.location}
            riderStale={snapshot.rider?.isStale}
          />
          {snapshot.rider ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success-light text-success flex items-center justify-center">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">{snapshot.rider.name}</p>
                  <p className="text-[11px] text-text-secondary">
                    {snapshot.rider.isStale ? "Location updating…" : "Your delivery partner"}
                  </p>
                </div>
              </div>
              {!snapshot.isTerminal && snapshot.rider.tripStatus !== "COMPLETED" && <CallButton orderId={orderId} target="RIDER" label="Call" />}
            </div>
          ) : (
            !snapshot.isTerminal && <p className="text-xs text-text-secondary">We&apos;ll assign a delivery partner as your food nears ready.</p>
          )}
        </section>
      )}

      {/* Progress */}
      {!failed && (
        <section className="bg-white rounded-3xl border border-border p-5">
          <ol className="relative pl-7 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {STEPS.map((step) => {
              const idx = ORDER.indexOf(step.state);
              const done = currentIdx > idx || delivered;
              const current = !done && (currentIdx === idx || (step.state === FulfillmentState.OUT_FOR_DELIVERY && currentIdx >= ORDER.indexOf(FulfillmentState.PICKED_UP) && !delivered) || (step.state === FulfillmentState.PREPARING && state === FulfillmentState.READY_FOR_PICKUP));
              const at = snapshot.timeline.find((t) => t.state === step.state)?.at;
              return (
                <li key={step.state} className="relative">
                  <span
                    className={`absolute -left-7 w-6 h-6 rounded-full flex items-center justify-center ${
                      done ? "bg-success text-white" : current ? "bg-brand text-white animate-pulse" : "bg-surface-muted text-text-secondary border border-border"
                    }`}
                  >
                    <step.icon className="w-3.5 h-3.5" />
                  </span>
                  <p className={`text-sm font-bold ${done || current ? "text-text-primary" : "text-text-secondary"}`}>{step.title}</p>
                  {at && <p className="text-[11px] text-text-secondary">{formatTime(at)}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {failed && (
        <section className="p-4 bg-red-50 rounded-2xl border border-red-200 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-red-900">{state === FulfillmentState.CANCELLED ? "Order cancelled" : "Delivery could not be completed"}</p>
            <p className="text-red-800 mt-0.5">
              {(order.refundedPaise ?? 0) > 0
                ? `${formatRupees(order.refundedPaise!)} is being refunded to your original payment method (usually 5–7 working days).`
                : order.paymentStatus === "PENDING"
                  ? "You were not charged for this order."
                  : "Contact support if you believe you are owed a refund."}
            </p>
          </div>
        </section>
      )}

      {/* Rating */}
      {order.canRate && (
        <section className="bg-white rounded-3xl border border-border p-5">
          <h2 className="font-bold mb-3">Rate your order</h2>
          <RatingForm orderId={orderId} onDone={() => tracking.refetch()} />
        </section>
      )}
      {order.rating && (
        <p className="text-sm text-text-secondary flex items-center gap-1">
          You rated this order {order.rating.foodRating} <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
        </p>
      )}

      {/* Summary */}
      <section className="bg-white rounded-3xl border border-border p-5 text-sm">
        <h2 className="font-bold mb-3">Order summary</h2>
        <ul className="space-y-2">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-3">
              <span>
                {i.quantity} × {i.name}
                {i.variantName && <span className="text-text-secondary"> ({i.variantName})</span>}
                {i.selectedOptionNames.length > 0 && <span className="block text-[11px] text-text-secondary">{i.selectedOptionNames.join(", ")}</span>}
              </span>
              <span className="font-medium">{formatRupees(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs text-text-secondary">
          {order.breakdown.discountPaise > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount {order.couponCode && `(${order.couponCode})`}</span>
              <span>−{formatRupees(order.breakdown.discountPaise)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-black text-text-primary">
            <span>Total paid</span>
            <span>{formatRupees(order.breakdown.payablePaise)}</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border text-xs text-text-secondary flex gap-2">
          <MapPin className="w-4 h-4 shrink-0" />
          <span>
            {order.deliveryAddress.building}, {order.deliveryAddress.street}
          </span>
        </div>
        <p className="text-[11px] text-text-secondary mt-2">Placed {formatDateTime(order.createdAt)}</p>
      </section>

      <div className="flex flex-wrap gap-3">
        {order.canCancel && (
          <button onClick={() => setCancelOpen(true)} className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold">
            Cancel order
          </button>
        )}
        {snapshot.isTerminal && (
          <button onClick={reorder} className="px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-bold flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" /> Reorder
          </button>
        )}
        {!snapshot.isTerminal && (
          <CallButton orderId={orderId} target="RESTAURANT" label="Call restaurant" className="px-4 py-2.5 rounded-xl border border-border text-sm font-bold flex items-center gap-1.5" />
        )}
        {delivered && (
          <Link href={`/orders/${orderId}/invoice`} className="px-4 py-2.5 rounded-xl border border-border text-sm font-bold flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Invoice
          </Link>
        )}
        <button onClick={() => setHelpOpen(true)} className="px-4 py-2.5 rounded-xl border border-border text-sm font-bold flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4" /> Get help
        </button>
      </div>

      <HelpSheet orderId={orderId} open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        size="sm"
        title="Cancel this order?"
        description={order.paymentStatus === "PENDING" ? "You have not been charged." : "You'll get a full refund to your original payment method."}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setCancelOpen(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold">
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
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2"
            >
              {cancelling && <Spinner />} Cancel order
            </button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">Once the restaurant accepts your order it can no longer be cancelled from the app.</p>
      </Modal>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bike,
  Camera,
  Check,
  Copy,
  FileText,
  Gift,
  HelpCircle,
  ImagePlus,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  ShieldAlert,
  Star,
  UtensilsCrossed,
  X,
  XCircle,
} from "lucide-react";
import { FulfillmentState, OrderDetailDto } from "@startup/contracts";
import type { AddonUpsellSku, TrackingSnapshot } from "@startup/api-client";
import { TrackingMap } from "@/components/tracking/tracking-map";
import { CallButton } from "@/components/support/call-button";
import { HelpSheet } from "@/components/support/help-sheet";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { OrderChat } from "@/components/orders/order-chat";
import { ReportIssueButton } from "@/components/orders/report-issue";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/features/i18n/use-i18n";
import { useAuth } from "@/features/auth/auth-context";
import { useCartStore } from "@/features/cart/cart-store";
import { ApiError, errorMessage, useApi } from "@/lib/api";
import { STATE_LABELS, formatDateTime, formatRupees, formatTime } from "@/lib/format";
import { subscribeSse } from "@/lib/sse";

const ADDON_BLOCKED_STATES: FulfillmentState[] = [
  FulfillmentState.DELIVERED,
  FulfillmentState.CANCELLED,
  FulfillmentState.DELIVERY_FAILED,
  FulfillmentState.PENDING_PAYMENT,
];

const STEPS: Array<{ state: FulfillmentState; title: string }> = [
  { state: FulfillmentState.AWAITING_MERCHANT, title: "Placed" },
  { state: FulfillmentState.ACCEPTED, title: "Confirmed" },
  { state: FulfillmentState.PREPARING, title: "Preparing" },
  { state: FulfillmentState.OUT_FOR_DELIVERY, title: "On the way" },
  { state: FulfillmentState.DELIVERED, title: "Delivered" },
];
const HANDOVER_LABELS: Record<string, string> = {
  DOOR: "At my door",
  RECEPTION: "At reception",
  SECURITY: "With security",
  HAND_ME: "Handed to me",
};

const PICKUP_STEPS: Array<{ state: FulfillmentState; title: string }> = [
  { state: FulfillmentState.AWAITING_MERCHANT, title: "Placed" },
  { state: FulfillmentState.ACCEPTED, title: "Confirmed" },
  { state: FulfillmentState.PREPARING, title: "Preparing" },
  { state: FulfillmentState.READY_FOR_PICKUP, title: "Ready" },
  { state: FulfillmentState.DELIVERED, title: "Collected" },
];

function activePickupStep(state: FulfillmentState): number {
  if (state === FulfillmentState.DELIVERED) return 4;
  if (state === FulfillmentState.READY_FOR_PICKUP) return 3;
  if (state === FulfillmentState.PREPARING) return 2;
  if (state === FulfillmentState.ACCEPTED) return 1;
  return 0;
}

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

function RatingForm({
  orderId,
  items,
  onDone,
}: {
  orderId: string;
  items: OrderDetailDto["items"];
  onDone: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const [food, setFood] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dishRatings, setDishRatings] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos, ...Array.from(files)].slice(0, 3);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPhotos(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

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
          const uploaded: string[] = [];
          for (const file of photos) {
            if (file.size > 2 * 1024 * 1024) throw new Error("Photos must be 2 MB or smaller.");
            const { url } = await api.uploadImage(file);
            uploaded.push(url);
          }
          await api.rateOrder(orderId, {
            foodRating: food,
            deliveryRating: delivery || undefined,
            comment: comment.trim() || undefined,
            photos: uploaded,
            dishRatings: Object.entries(dishRatings)
              .filter(([, rating]) => rating > 0)
              .map(([menuItemId, rating]) => ({ menuItemId, rating })),
          });
          toast("Thanks for your feedback", "success");
          previews.forEach((p) => URL.revokeObjectURL(p));
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
      <div>
        <p className="label">
          Rate your dishes <span className="font-normal text-ink-muted">(optional)</span>
        </p>
        <ul className="divide-y divide-line rounded-2xl border border-line px-4">
          {items.map((item, idx) => (
            <li key={`${item.menuItemId}-${idx}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm text-ink">
                <span className="text-ink-muted tabular">{item.quantity}×</span> {item.name}
              </span>
              <div className="flex items-center gap-1" role="radiogroup" aria-label={`Rate ${item.name}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={dishRatings[item.menuItemId] === n}
                    aria-label={`${item.name}: ${n} star${n > 1 ? "s" : ""}`}
                    onClick={() =>
                      setDishRatings((prev) => {
                        const next = { ...prev };
                        if (next[item.menuItemId] === n) delete next[item.menuItemId];
                        else next[item.menuItemId] = n;
                        return next;
                      })
                    }
                    className="p-0.5"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        n <= (dishRatings[item.menuItemId] ?? 0) ? "fill-ink text-ink" : "text-line-strong"
                      }`}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Anything others should know? (optional)"
        className="input"
      />
      <div>
        <p className="label">
          Add photos <span className="font-normal text-ink-muted">(optional, up to 3)</span>
        </p>
        <div className="flex flex-wrap gap-3">
          {previews.map((src, i) => (
            <span key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Review photo ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  URL.revokeObjectURL(src);
                  const next = photos.filter((_, idx) => idx !== i);
                  setPhotos(next);
                  setPreviews(next.map((f) => URL.createObjectURL(f)));
                }}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {photos.length < 3 && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-ink-muted hover:border-ink hover:text-ink">
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">Add</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => addPhotos(e.target.files)}
              />
            </label>
          )}
        </div>
      </div>
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
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const replaceCart = useCartStore((s) => s.replaceWith);
  const { isSignedIn } = useAuth();
  const [liveStatus, setLiveStatus] = useState<"connecting" | "open" | "retrying" | "closed">("connecting");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<"CUSTOMER_RIDER" | "CUSTOMER_MERCHANT">("CUSTOMER_RIDER");
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

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

  const orderState = tracking.data?.order.fulfillmentState;
  const proof = useQuery({
    queryKey: ["order-proof", orderId],
    queryFn: () => api.getOrderProof(orderId),
    enabled: isSignedIn && (orderState === FulfillmentState.DELIVERED || orderState === FulfillmentState.OUT_FOR_DELIVERY),
  });
  const issues = useQuery({
    queryKey: ["order-issues", orderId],
    queryFn: () => api.getOrderIssues(orderId),
    enabled:
      isSignedIn &&
      (orderState === FulfillmentState.DELIVERED ||
        orderState === FulfillmentState.CANCELLED ||
        orderState === FulfillmentState.DELIVERY_FAILED),
  });
  const tipEligible =
    orderState === FulfillmentState.DELIVERED &&
    !!tracking.data?.order.rider &&
    !tracking.data.order.tipPaise;
  const tipWallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.getWallet(),
    enabled: isSignedIn && tipEligible,
  });
  const addonEligible =
    isSignedIn &&
    !!orderState &&
    !ADDON_BLOCKED_STATES.includes(orderState);
  const addonUpsell = useQuery({
    queryKey: ["addon-upsell", orderId],
    queryFn: () => api.getAddonUpsell(orderId),
    enabled: addonEligible,
    refetchInterval: 30_000,
  });
  const [addingAddon, setAddingAddon] = useState<string | null>(null);
  const billSplit = useQuery({
    queryKey: ["order-split", orderId],
    queryFn: () => api.getOrderSplit(orderId),
    enabled: isSignedIn && orderState === FulfillmentState.DELIVERED,
  });
  const [splitParts, setSplitParts] = useState(3);
  const [creatingSplit, setCreatingSplit] = useState(false);
  const createSplit = async () => {
    setCreatingSplit(true);
    try {
      await api.createOrderSplit(orderId, splitParts);
      await queryClient.invalidateQueries({ queryKey: ["order-split", orderId] });
      toast("Split link ready to share", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCreatingSplit(false);
    }
  };
  const addAddon = async (sku: AddonUpsellSku) => {
    setAddingAddon(sku.id);
    try {
      const result = await api.addOneTapAddon(orderId, sku.id);
      await queryClient.invalidateQueries({ queryKey: ["addon-upsell", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast(`${sku.name} added to this bag · ${formatRupees(result.payablePaise)} paid with credits`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setAddingAddon(null);
    }
  };
  const [tipping, setTipping] = useState<number | null>(null);

  const sendTip = async (amountPaise: number) => {
    setTipping(amountPaise);
    try {
      await api.tipOrder(orderId, amountPaise);
      toast(`₹${amountPaise / 100} tip sent to your delivery partner`, "success");
      await Promise.all([
        tracking.refetch(),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setTipping(null);
    }
  };

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
  const isPickup = order.orderMode === "PICKUP";
  const failed = state === FulfillmentState.CANCELLED || state === FulfillmentState.DELIVERY_FAILED;
  const delivered = state === FulfillmentState.DELIVERED;
  const steps = isPickup ? PICKUP_STEPS : STEPS;
  const step = isPickup ? activePickupStep(state) : activeStep(state);
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
        : isPickup && state === FulfillmentState.READY_FOR_PICKUP
          ? "Your food is ready. Show your pickup code at the counter."
          : isPickup && delivered && order.deliveredAt
            ? `Collected at ${formatTime(order.deliveredAt)}. Enjoy your meal.`
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
              <p className="text-xs text-ink-muted">{isPickup ? "min to ready" : "min away"}</p>
            </div>
          ) : null}
        </div>
        {subtitle && <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>}
      </header>

      {!failed && (
        <ol className="mt-8 grid grid-cols-5 gap-1.5" aria-label="Order progress">
          {steps.map((s, i) => {
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

      {/* Delivery OTP / pickup code */}
      {!snapshot.isTerminal && (isPickup ? order.pickupCode : order.deliveryOtp) && (
        <section className="panel mt-10 flex items-center justify-between gap-6 p-6">
          <div>
            <p className="text-sm font-medium text-ink">{isPickup ? "Pickup code" : t("tracking.otp")}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {isPickup
                ? "Show this at the counter. Staff will hand over your order."
                : order.recipientName
                  ? `Share this with ${order.recipientName} or the rider when the order arrives.`
                  : t("tracking.otpHint")}
            </p>
          </div>
          <p className="text-3xl font-semibold tracking-[0.25em] text-ink tabular">
            {isPickup ? order.pickupCode : order.deliveryOtp}
          </p>
        </section>
      )}

      {order.recipientName && !failed && (
        <section className="panel mt-6 p-6">
          <p className="text-sm font-medium text-ink">Gift for {order.recipientName}</p>
          {order.giftMessage && <p className="mt-1 text-sm italic leading-relaxed text-ink-soft">“{order.giftMessage}”</p>}
          <p className="mt-2 text-xs text-ink-muted">
            The rider will call {order.recipientName}. Share your delivery code with them when the order arrives.
          </p>
        </section>
      )}

      {isPickup && !failed && (
        <section className="panel mt-6 flex items-start gap-4 p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white">
            <UtensilsCrossed className="h-5 w-5 text-ink" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Collect from {order.restaurant.name}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {order.deliveryAddress.building}, {order.deliveryAddress.street}
            </p>
            <p className="mt-1 text-xs text-ink-muted">Held for 20 minutes after it&apos;s marked ready.</p>
          </div>
        </section>
      )}

      {/* Map + rider (delivery only) */}
      {!failed && !delivered && !isPickup && (
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

      {order.contactless && !failed && !delivered && (
        <p className="notice notice-neutral mt-6">
          <Camera className="mt-0.5 h-4 w-4 shrink-0" /> Contactless delivery. Your partner will leave the order at your door and add
          a photo before completing it.
        </p>
      )}

      {addonEligible && (addonUpsell.data?.skus.length ?? 0) > 0 && (
        <section className="panel mt-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <Plus className="h-4 w-4" /> Add a little extra
              </h2>
              <p className="mt-1 text-sm text-ink-muted">One tap, added to the same bag. No extra delivery or platform fee.</p>
            </div>
            <span className="badge badge-neutral">Paid with credits</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {addonUpsell.data!.skus.map((sku) => (
              <button
                key={sku.id}
                className="rounded-2xl border border-line bg-white p-4 text-left transition hover:border-ink/40 disabled:opacity-50"
                disabled={addingAddon !== null}
                onClick={() => addAddon(sku)}
              >
                <span className="block text-sm font-medium text-ink">{sku.name}</span>
                <span className="mt-1 block text-sm font-semibold text-ink tabular">{formatRupees(sku.pricePaise)}</span>
                <span className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                  {addingAddon === sku.id ? <Spinner /> : <Plus className="h-3 w-3" />}
                  {addingAddon === sku.id ? "Adding…" : "Add to bag"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {proof.data?.photoUrl && (
        <section className="mt-8 overflow-hidden rounded-3xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proof.data.photoUrl} alt="Proof of delivery" className="max-h-72 w-full object-cover" />
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">Delivery photo</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {proof.data.note ?? "Added by your delivery partner at the door."}
              </p>
            </div>
            <span className="badge badge-success">Verified handover</span>
          </div>
        </section>
      )}

      {delivered && order.rider && (
        <section className="mt-8 rounded-3xl border border-line p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <Gift className="h-4 w-4" /> {order.tipPaise ? "You tipped your delivery partner" : "Tip your delivery partner"}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {order.tipPaise
                  ? `${formatRupees(order.tipPaise)} sent from your BiteBox Credits. Thank you.`
                  : "100% goes to the partner. Paid from BiteBox Credits."}
              </p>
            </div>
            <span className="badge badge-neutral">{order.rider.name.split(" ")[0]}</span>
          </div>
          {!order.tipPaise && (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {[2_000, 3_000, 5_000].map((amount) => {
                  const balance = tipWallet.data?.account.balancePaise ?? 0;
                  const canTip = balance >= amount && tipping === null;
                  return (
                    <button
                      key={amount}
                      disabled={!canTip}
                      onClick={() => sendTip(amount)}
                      className="chip h-10 px-4 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {tipping === amount ? <Spinner /> : formatRupees(amount)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Balance: {formatRupees(tipWallet.data?.account.balancePaise ?? 0)}
                {(tipWallet.data?.account.balancePaise ?? 0) < 2_000 && (
                  <>
                    {" · "}
                    <Link href="/account?tab=rewards" className="underline underline-offset-4 hover:text-ink">
                      Earn credits
                    </Link>
                  </>
                )}
              </p>
            </>
          )}
        </section>
      )}

      {delivered && (
        <section className="mt-8 rounded-3xl border border-line p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <Copy className="h-4 w-4" /> {t("tracking.split")}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Friends pay their share from BiteBox Credits; the credits land in your wallet.
              </p>
            </div>
            {billSplit.data?.split && (
              <span className={`badge ${billSplit.data.split.status === "SETTLED" ? "badge-success" : "badge-neutral"}`}>
                {billSplit.data.split.status === "SETTLED" ? "settled" : `${billSplit.data.split.shares.filter((s) => s.status === "PENDING").length} pending`}
              </span>
            )}
          </div>
          {billSplit.data?.split ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-subtle px-3 py-2 font-mono text-xs text-ink">
                  {typeof window !== "undefined" ? `${window.location.origin}/split/${billSplit.data.split.token}` : `/split/${billSplit.data.split.token}`}
                </code>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/split/${billSplit.data!.split!.token}`);
                      toast("Split link copied", "success");
                    } catch {
                      toast("Copy the link manually", "error");
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {billSplit.data.split.shares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
                    <span className="text-ink-muted">Share {share.shareIndex} · {formatRupees(share.amountPaise)}</span>
                    <span className={share.status === "PAID" ? "text-success" : "text-ink-muted"}>
                      {share.status === "PAID" ? `paid${share.payerName ? ` by ${share.payerName.split(" ")[0]}` : ""}` : "pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <span className="label">Split between</span>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map((parts) => (
                    <button
                      key={parts}
                      role="radio"
                      aria-checked={splitParts === parts}
                      onClick={() => setSplitParts(parts)}
                      className={`chip h-10 px-4 ${splitParts === parts ? "chip-active" : ""}`}
                    >
                      {parts}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" disabled={creatingSplit || billSplit.isFetching} onClick={createSplit}>
                {creatingSplit && <Spinner />} Create split link
              </button>
            </div>
          )}
        </section>
      )}

      {!!issues.data?.length && (
        <section className="mt-10">
          <h2 className="h-section">Your reports</h2>
          <ul className="rows mt-3">
            {issues.data.map((issue) => (
              <li key={issue.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-medium capitalize text-ink">{issue.category.toLowerCase().replace(/_/g, " ")}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {issue.status === "RESOLVED"
                      ? issue.walletCreditPaise > 0
                        ? `${formatRupees(issue.walletCreditPaise)} credited to your wallet`
                        : issue.adminNote ?? "Resolved"
                      : issue.status === "REJECTED"
                        ? issue.adminNote ?? "Closed"
                        : "Support is reviewing this"}
                  </p>
                </div>
                <span className={`badge ${issue.status === "RESOLVED" ? "badge-success" : issue.status === "REJECTED" ? "badge-neutral" : "badge-warn"}`}>
                  {issue.status.toLowerCase().replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
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
        {!snapshot.isTerminal && (
          <button
            onClick={() => {
              setChatChannel(snapshot.rider ? "CUSTOMER_RIDER" : "CUSTOMER_MERCHANT");
              setChatOpen(true);
            }}
            className="btn btn-outline"
          >
            <MessageCircle className="h-4 w-4" /> Message
          </button>
        )}
        {delivered && (
          <Link href={`/orders/${orderId}/invoice`} className="btn btn-outline">
            <FileText className="h-4 w-4" /> Invoice
          </Link>
        )}
        {delivered && <ReportIssueButton orderId={orderId} items={order.items} />}
        <button onClick={() => setHelpOpen(true)} className="btn btn-outline">
          <HelpCircle className="h-4 w-4" /> Get help
        </button>
        {!failed && (
          <button onClick={() => setSafetyOpen(true)} className="btn btn-outline">
            <ShieldAlert className="h-4 w-4" /> Safety
          </button>
        )}
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
            <RatingForm orderId={orderId} items={order.items} onDone={() => tracking.refetch()} />
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
            <dt className="text-ink-muted">{isPickup ? "Pickup from" : "Delivering to"}</dt>
            <dd className="mt-1 text-ink">
              {order.deliveryAddress.building}, {order.deliveryAddress.street}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Placed</dt>
            <dd className="mt-1 text-ink">{formatDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Payment</dt>
            <dd className="mt-1 text-ink">
              {order.paymentMethod === "COD"
                ? "Cash on delivery"
                : order.paymentMethod === "WALLET"
                  ? "BiteBox Credits"
                  : "Card / UPI"}
            </dd>
          </div>
          {order.scheduledFor && (
            <div>
              <dt className="text-ink-muted">Scheduled for</dt>
              <dd className="mt-1 text-ink">{formatDateTime(order.scheduledFor)}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-muted">Handover</dt>
            <dd className="mt-1 text-ink">
              {isPickup
                ? "Collect at the counter"
                : order.contactless
                  ? "Contactless · left at door"
                  : HANDOVER_LABELS[order.deliveryPreference ?? "DOOR"] ?? "At my door"}
              {order.cutleryOptIn === false ? " · no cutlery" : ""}
            </dd>
          </div>
        </dl>
      </section>

      <Modal open={chatOpen} onClose={() => setChatOpen(false)} title="Order messages" size="lg">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setChatChannel("CUSTOMER_RIDER")}
            aria-pressed={chatChannel === "CUSTOMER_RIDER"}
            disabled={!snapshot.rider}
            className="chip"
          >
            <Bike className="h-3.5 w-3.5" /> Delivery partner
          </button>
          <button
            onClick={() => setChatChannel("CUSTOMER_MERCHANT")}
            aria-pressed={chatChannel === "CUSTOMER_MERCHANT"}
            className="chip"
          >
            <UtensilsCrossed className="h-3.5 w-3.5" /> Restaurant
          </button>
        </div>
        <OrderChat
          orderId={orderId}
          channel={chatChannel}
          viewer="CUSTOMER"
          title={chatChannel === "CUSTOMER_RIDER" ? snapshot.rider?.name ?? "Delivery partner" : order.restaurant.name}
          subtitle="Messages close when the order is complete"
        />
      </Modal>

      <Modal
        open={safetyOpen}
        onClose={() => {
          setSafetyOpen(false);
          setSosSent(false);
        }}
        title={sosSent ? "Help is on the way" : "Safety & emergency"}
        description={
          sosSent
            ? "Our safety team has been alerted and will contact you immediately."
            : "Use SOS only if you feel unsafe. Your live order details are shared with our safety team."
        }
        size="sm"
      >
        {sosSent ? (
          <div className="space-y-4 py-2">
            <p className="notice notice-danger">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> If you are in immediate danger, call 112 now.
            </p>
            <a href="tel:112" className="btn btn-danger btn-lg btn-block">
              <Phone className="h-4 w-4" /> Call 112
            </a>
            <p className="text-center text-xs text-ink-muted">
              A priority support conversation is open. You can also{" "}
              <Link href="/support" className="link">
                message our team
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              disabled={sosSending}
              onClick={async () => {
                setSosSending(true);
                try {
                  const coords = await new Promise<GeolocationPosition | null>((resolve) =>
                    navigator.geolocation.getCurrentPosition(
                      (pos) => resolve(pos),
                      () => resolve(null),
                      { timeout: 5000, maximumAge: 30_000 }
                    )
                  );
                  await api.createSafetyEvent({
                    eventType: "SOS",
                    orderId,
                    latitude: coords?.coords.latitude,
                    longitude: coords?.coords.longitude,
                    note: "SOS raised from live order",
                  });
                  setSosSent(true);
                } catch (err) {
                  toast(errorMessage(err), "error");
                } finally {
                  setSosSending(false);
                }
              }}
              className="btn btn-danger btn-lg btn-block"
            >
              {sosSending ? <Spinner /> : <ShieldAlert className="h-4 w-4" />} Raise SOS
            </button>
            <a href="tel:112" className="btn btn-outline btn-block">
              <Phone className="h-4 w-4" /> Call 112
            </a>
            <button
              disabled={shareBusy}
              onClick={async () => {
                setShareBusy(true);
                try {
                  const { url } = await api.shareOrder(orderId);
                  if (navigator.share) {
                    await navigator.share({ title: "Track my BiteBox order", text: "Follow my delivery live:", url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    toast("Private tracking link copied. It expires in 24 hours.", "success");
                  }
                } catch (err) {
                  toast(errorMessage(err), "error");
                } finally {
                  setShareBusy(false);
                }
              }}
              className="btn btn-outline btn-block"
            >
              {shareBusy && <Spinner />} {t("tracking.share")}
            </button>
            <p className="text-center text-xs text-ink-muted">
              The link shows only status and ETA — never your address or phone number.
            </p>
            <div className="rounded-2xl bg-subtle p-4 text-sm text-ink-soft">
              <p className="font-medium text-ink">Add trusted contacts</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Our safety team can coordinate with people you trust if you ever raise an SOS.
              </p>
              <Link href="/account?tab=profile" className="mt-2 inline-block text-xs font-medium text-ink underline underline-offset-4">
                Manage trusted contacts
              </Link>
            </div>
          </div>
        )}
      </Modal>

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

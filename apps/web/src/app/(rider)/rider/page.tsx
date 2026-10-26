"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Camera, ImagePlus, MapPin, Navigation, ShieldCheck, Store, Trophy, Wallet } from "lucide-react";
import { DeliveryTripStatus } from "@startup/contracts";
import { PortalHeader, RoleGate } from "@/components/portal/role-gate";
import { CallButton } from "@/components/support/call-button";
import { EarningsPanel } from "@/components/payouts/earnings-panel";
import { OrderChat } from "@/components/orders/order-chat";
import { RiderVerificationPanel } from "@/components/rider/verification-panel";
import { RiderRewardsPanel } from "@/components/rider/rewards-panel";
import { Field, Toggle } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageSpinner, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ApiError, errorMessage, useApi } from "@/lib/api";
import { playChime, unlockAudio } from "@/lib/alert-sound";
import { formatDistance, formatRupees } from "@/lib/format";
import { directionsUrl } from "@/lib/geo";

const PING_INTERVAL_MS = 10_000;

/**
 * Streams the rider's GPS position while online. Browsers pause this when the PWA
 * is backgrounded; a screen wake lock keeps it alive while the app is in front.
 */
function useLocationBroadcast(enabled: boolean) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    let wakeLock: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen")
      .then((lock) => (wakeLock = lock))
      .catch(() => undefined);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        if (Date.now() - last.current < PING_INTERVAL_MS) return;
        last.current = Date.now();
        api
          .riderUpdateLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            headingDegrees: pos.coords.heading ?? undefined,
            speedMps: pos.coords.speed ?? undefined,
            capturedAt: new Date(pos.timestamp).toISOString(),
          })
          .catch(() => undefined);
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? "Location permission is required to receive orders." : "Waiting for GPS signal…"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [enabled, api]);

  return error;
}

function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  return <span className={`badge tabular ${left < 10 ? "bg-danger text-white" : "badge-neutral"}`}>{left}s</span>;
}

const TRIP_STEPS: Array<{ status: DeliveryTripStatus[]; label: string }> = [
  { status: [DeliveryTripStatus.ASSIGNED], label: "To restaurant" },
  { status: [DeliveryTripStatus.AT_PICKUP], label: "Pickup" },
  { status: [DeliveryTripStatus.PICKED_UP], label: "To customer" },
  { status: [DeliveryTripStatus.AT_DROPOFF], label: "Handover" },
];

function RiderTrips({ active }: { active: boolean }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("Customer not reachable");
  const [proofUploading, setProofUploading] = useState(false);
  const lastOfferId = useRef<string | null>(null);

  const trip = useQuery({ queryKey: ["rider-trip"], queryFn: () => api.getRiderActiveTrip(), refetchInterval: 4000, refetchIntervalInBackground: true });
  const online = trip.data?.rider.isOnline ?? false;
  const activeOrderId = trip.data?.order?.orderId;
  const proof = useQuery({
    queryKey: ["delivery-proof", activeOrderId],
    queryFn: () => api.getOrderProof(activeOrderId!),
    enabled: !!activeOrderId && !!trip.data?.assignment,
  });
  // Keeps running while the earnings tab is open: going offline is the only way to stop it
  const gpsError = useLocationBroadcast(online);

  useEffect(() => {
    const offerId = trip.data?.pendingOffer?.id ?? null;
    if (offerId && offerId !== lastOfferId.current) playChime();
    lastOfferId.current = offerId;
  }, [trip.data?.pendingOffer?.id]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok, "success");
      setCode("");
    } catch (err) {
      toast(errorMessage(err), "error");
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR") return;
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ["rider-trip"] });
    }
  };

  if (!active) return null;
  if (trip.isPending) return <PageSpinner />;
  if (!trip.data) return <p className="notice notice-danger">{errorMessage(trip.error)}</p>;

  const { assignment, order, pickupLocation, pendingOffer, offerOrder } = trip.data;
  const earnings = (o?: { breakdown: { deliveryFeePaise: number; surgePaise: number; tipPaise?: number } } | null) =>
    o ? o.breakdown.deliveryFeePaise + o.breakdown.surgePaise + (o.breakdown.tipPaise ?? 0) : 0;

  const step = (next: "AT_PICKUP" | "PICKED_UP" | "AT_DROPOFF" | "COMPLETED", extra: { challengeCode?: string } = {}, ok?: string) =>
    run(() => api.riderUpdateMilestone({ assignmentId: assignment!.id, nextStatus: next, ...extra }), ok);
  const stepIndex = assignment ? TRIP_STEPS.findIndex((s) => s.status.includes(assignment.status as DeliveryTripStatus)) : -1;

  const uploadProof = async (file: File | undefined) => {
    if (!file || !order) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Photo must be 2 MB or smaller", "error");
      return;
    }
    setProofUploading(true);
    try {
      const coords = await new Promise<GeolocationPosition | null>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          () => resolve(null),
          { timeout: 5000, maximumAge: 60_000 }
        )
      );
      const { url } = await api.uploadProofImage(file);
      await api.saveDeliveryProof(order.orderId, {
        photoUrl: url,
        latitude: coords?.coords.latitude,
        longitude: coords?.coords.longitude,
        note: order.contactless ? "Contactless delivery — left at door" : "Delivery proof",
      });
      await queryClient.invalidateQueries({ queryKey: ["delivery-proof", order.orderId] });
      toast("Delivery photo saved", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setProofUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-3xl bg-subtle p-5">
        <div>
          <p className="font-semibold text-ink">{online ? "You're online" : "You're offline"}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{assignment ? "Finish this trip to go offline" : online ? "Receiving delivery requests" : "Go online to receive requests"}</p>
        </div>
        <Toggle
          label="Online"
          checked={online}
          disabled={busy || !!assignment}
          onChange={() => {
            unlockAudio();
            run(() => api.riderSetOnline(!online), online ? "You're offline" : "You're online");
          }}
        />
      </div>

      {online && gpsError && <p className="notice notice-warn">{gpsError}</p>}

      {!assignment && !pendingOffer && (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <span className={`flex h-16 w-16 items-center justify-center rounded-full ${online ? "bg-success-soft text-success" : "bg-subtle text-ink-muted"}`}>
            <Bike className={`h-7 w-7 ${online ? "animate-pulse" : ""}`} />
          </span>
          <p className="mt-6 text-lg font-semibold text-ink">{online ? "Looking for orders near you" : "Ready when you are"}</p>
          <p className="mt-1.5 max-w-xs text-sm text-ink-muted">{online ? "Keep this screen open. New requests will ring." : "Go online to start receiving delivery requests."}</p>
        </div>
      )}

      {!assignment && pendingOffer && offerOrder && (
        <section className="animate-sheet-up rounded-3xl bg-white p-6 shadow-pop ring-1 ring-ink">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">New delivery request</h2>
            <OfferCountdown expiresAt={pendingOffer.expiresAt} />
          </div>
          <p className="mt-6 text-4xl font-semibold tracking-tight text-ink tabular">{formatRupees(earnings(offerOrder))}</p>
          <p className="text-sm text-ink-muted">You earn, including tip</p>
          <dl className="mt-6 space-y-4 text-[15px]">
            <div className="flex gap-3">
              <Store className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
              <div>
                <dt className="font-medium text-ink">{offerOrder.restaurant.name}</dt>
                {pendingOffer.distanceToPickupMeters !== undefined && <dd className="text-sm text-ink-muted">{formatDistance(pendingOffer.distanceToPickupMeters)} away</dd>}
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
              <dt className="text-ink">{offerOrder.deliveryAddress.street}</dt>
            </div>
          </dl>
          <div className="mt-8 flex gap-3">
            <button disabled={busy} onClick={() => run(() => api.riderRejectOffer(pendingOffer.id))} className="btn btn-secondary btn-lg flex-1">
              Decline
            </button>
            <button disabled={busy} onClick={() => run(() => api.riderAcceptOffer(pendingOffer.id), "Trip accepted")} className="btn btn-success btn-lg flex-[2]">
              Accept
            </button>
          </div>
        </section>
      )}

      {assignment && order && (
        <section className="card p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">#{order.orderNumber}</span>
            <span className="text-ink-muted">
              Earn <span className="font-medium text-ink tabular">{formatRupees(earnings(order))}</span>
            </span>
          </div>
          <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Trip progress">
            {TRIP_STEPS.map((s, i) => (
              <li key={s.label} aria-current={i === stepIndex ? "step" : undefined}>
                <span className={`block h-1.5 rounded-full ${i < stepIndex ? "bg-ink" : i === stepIndex ? "bg-ink/40" : "bg-line"}`} />
                <span className={`mt-2 block truncate text-[11px] ${i <= stepIndex ? "font-medium text-ink" : "text-ink-muted"}`}>{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 space-y-6">
            {(assignment.status === DeliveryTripStatus.ASSIGNED || assignment.status === DeliveryTripStatus.AT_PICKUP) && (
              <>
                <div>
                  <p className="eyebrow">Pick up from</p>
                  <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink">{order.restaurant.name}</p>
                  <p className="mt-1 text-sm capitalize text-ink-muted">Kitchen: {order.fulfillmentState.replace(/_/g, " ").toLowerCase()}</p>
                </div>
                <ul className="space-y-1.5 rounded-2xl bg-subtle p-4 text-[15px] text-ink">
                  {order.items.map((i, idx) => (
                    <li key={idx}>
                      <span className="tabular text-ink-muted">{i.quantity}×</span> {i.name}
                      {i.variantName && <span className="text-ink-muted"> · {i.variantName}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {assignment.status === DeliveryTripStatus.ASSIGNED && (
              <div className="grid grid-cols-2 gap-3">
                {pickupLocation && (
                  <a href={directionsUrl(pickupLocation)} target="_blank" rel="noreferrer" className="btn btn-outline btn-lg">
                    <Navigation className="h-4 w-4" /> Navigate
                  </a>
                )}
                <CallButton orderId={order.orderId} target="RESTAURANT" label="Call" className="btn btn-outline btn-lg" />
                <button disabled={busy} onClick={() => step("AT_PICKUP")} className="btn btn-primary btn-lg col-span-2">
                  I&apos;ve reached the restaurant
                </button>
              </div>
            )}

            {assignment.status === DeliveryTripStatus.AT_PICKUP && (
              <div className="space-y-3">
                {order.fulfillmentState !== "READY_FOR_PICKUP" && (
                  <Field label="Pickup code from the restaurant">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="••••"
                      className="input h-16 text-center text-2xl font-semibold tracking-[0.4em]"
                    />
                  </Field>
                )}
                <button disabled={busy} onClick={() => step("PICKED_UP", { challengeCode: code || undefined }, "Order picked up")} className="btn btn-primary btn-lg btn-block">
                  {busy && <Spinner />} Confirm pickup
                </button>
                <CallButton orderId={order.orderId} target="RESTAURANT" label="Call restaurant" className="btn btn-ghost btn-block" />
              </div>
            )}

            {(assignment.status === DeliveryTripStatus.PICKED_UP || assignment.status === DeliveryTripStatus.AT_DROPOFF) && (
              <>
                <div>
                  <p className="eyebrow">Deliver to</p>
                  <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink">{order.deliveryAddress.building}</p>
                  <p className="mt-1 text-[15px] text-ink-soft">{order.deliveryAddress.street}</p>
                  {order.deliveryAddress.landmark && <p className="text-sm text-ink-muted">Near {order.deliveryAddress.landmark}</p>}
                  {order.recipientName && (
                    <p className="notice notice-neutral mt-4">
                      Gift order for <strong>{order.recipientName}</strong>. The customer will share the delivery code.
                    </p>
                  )}
                  {order.instructions && <p className="notice notice-warn mt-4">{order.instructions}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <a href={directionsUrl(order.deliveryAddress)} target="_blank" rel="noreferrer" className="btn btn-outline btn-lg">
                    <Navigation className="h-4 w-4" /> Navigate
                  </a>
                  <CallButton
                    orderId={order.orderId}
                    target="CUSTOMER"
                    label={order.recipientName ? "Call recipient" : "Call"}
                    className="btn btn-outline btn-lg"
                  />
                </div>
              </>
            )}

            {assignment.status === DeliveryTripStatus.PICKED_UP && (
              <button disabled={busy} onClick={() => step("AT_DROPOFF")} className="btn btn-primary btn-lg btn-block">
                I&apos;ve reached the customer
              </button>
            )}

            {assignment.status === DeliveryTripStatus.AT_DROPOFF && (
              <div className="space-y-3">
                {order.paymentMethod === "COD" && (
                  <p className="notice notice-warn">
                    Collect <strong>{formatRupees(order.breakdown.payablePaise)}</strong> in cash before handing over the order.
                  </p>
                )}
                {order.contactless && (
                  <div className="rounded-2xl border border-line p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Camera className="h-4 w-4" /> Contactless delivery
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Leave the order at the door and add a photo. The customer’s OTP still completes the handover.
                    </p>
                    {proof.data?.photoUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proof.data.photoUrl} alt="Delivery proof" className="mt-3 h-32 w-full rounded-xl object-cover" />
                        <p className="mt-2 flex items-center gap-1 text-xs text-success">Photo saved</p>
                      </>
                    ) : (
                      <label className="mt-3 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-ink-muted hover:border-ink hover:text-ink">
                        {proofUploading ? <Spinner /> : <ImagePlus className="h-5 w-5" />}
                        <span className="text-xs">{proofUploading ? "Uploading…" : "Add doorstep photo"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          className="sr-only"
                          disabled={proofUploading}
                          onChange={(e) => uploadProof(e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>
                )}
                <Field label="Customer's delivery code">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••"
                    className="input h-16 text-center text-2xl font-semibold tracking-[0.5em]"
                  />
                </Field>
                {order.contactless && !proof.data?.photoUrl && (
                  <p className="text-xs text-warn">Add the doorstep photo to enable completion.</p>
                )}
                <button
                  disabled={busy || code.length < 4 || (order.contactless && !proof.data?.photoUrl)}
                  onClick={() => step("COMPLETED", { challengeCode: code }, "Delivered. Great job!")}
                  className="btn btn-success btn-lg btn-block"
                >
                  {busy && <Spinner />} Complete delivery
                </button>
                <button onClick={() => setFailOpen(true)} className="btn btn-ghost btn-block text-ink-muted">
                  Customer unavailable?
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {assignment && order && (
        <OrderChat
          orderId={order.orderId}
          channel="CUSTOMER_RIDER"
          viewer="RIDER"
          title="Customer chat"
          subtitle="Available until you complete the delivery"
          compact
        />
      )}

      <Modal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        size="sm"
        title="Report a failed delivery"
        description="Only after waiting 10 minutes at the location and trying to call the customer."
        footer={
          <button
            disabled={busy}
            onClick={() => {
              setFailOpen(false);
              run(() => api.riderUpdateMilestone({ assignmentId: assignment!.id, nextStatus: "FAILED", failureReason: failReason }), "Reported to support");
            }}
            className="btn btn-danger btn-lg btn-block"
          >
            Report failed delivery
          </button>
        }
      >
        <Field label="Reason">
          <select value={failReason} onChange={(e) => setFailReason(e.target.value)} className="input">
            <option>Customer not reachable</option>
            <option>Wrong or incomplete address</option>
            <option>Customer refused the order</option>
            <option>Unsafe location</option>
          </select>
        </Field>
      </Modal>
    </div>
  );
}

function RiderShell() {
  const api = useApi();
  const [tab, setTab] = useState<"trips" | "verification" | "earnings" | "rewards">(() => {
    const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return requested === "earnings" || requested === "verification" || requested === "rewards" ? requested : "trips";
  });

  // A deep link from the header or the offline notice may mount before the router
  // updates `window.location`; sync once mounted so ?tab=verification opens KYC.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "verification" || requested === "earnings" || requested === "rewards") setTab(requested);
  }, []);

  // Browsers only allow the offer chime after a user gesture; unlock on the first tap anywhere
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <PortalHeader title="Delivery partner" />
      <div className="mx-auto max-w-lg px-5 pt-6">
        {/* Trips stay mounted on the earnings tab so GPS and new-request alerts keep working */}
        <RiderTrips active={tab === "trips"} />
        {tab === "verification" && <RiderVerificationPanel />}
        {tab === "earnings" && <EarningsPanel queryKey={["rider-earnings"]} load={() => api.getRiderEarnings()} saveAccount={(a) => api.saveRiderPayoutAccount(a)} />}
        {tab === "rewards" && <RiderRewardsPanel />}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-safe backdrop-blur-xl" aria-label="Rider sections">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
          {(
            [
              ["trips", "Trips", Bike],
              ["verification", "KYC", ShieldCheck],
              ["rewards", "Rewards", Trophy],
              ["earnings", "Earnings", Wallet],
            ] as const
          ).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                window.history.replaceState(null, "", `/rider?tab=${t}`);
              }}
              aria-current={tab === t ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${tab === t ? "text-ink" : "text-ink-muted"}`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={tab === t ? 2.2 : 1.8} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function RiderPage() {
  return (
    <RoleGate roles={["RIDER"]} title="Delivery partner app">
      <RiderShell />
    </RoleGate>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation, Power, Store, Timer, Wallet } from "lucide-react";
import { DeliveryTripStatus } from "@startup/contracts";
import { PortalHeader, RoleGate } from "@/components/portal/role-gate";
import { CallButton } from "@/components/support/call-button";
import { EarningsPanel } from "@/components/payouts/earnings-panel";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
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
  return <span className={`font-black ${left < 10 ? "text-red-600" : ""}`}>{left}s</span>;
}

function RiderApp() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("Customer not reachable");
  const lastOfferId = useRef<string | null>(null);

  const trip = useQuery({ queryKey: ["rider-trip"], queryFn: () => api.getRiderActiveTrip(), refetchInterval: 4000, refetchIntervalInBackground: true });
  const online = trip.data?.rider.isOnline ?? false;
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

  if (trip.isPending) return <div className="p-10 text-center"><Spinner /></div>;
  if (!trip.data) return <p className="p-6 text-sm text-red-700">{errorMessage(trip.error)}</p>;

  const { assignment, order, pickupLocation, pendingOffer, offerOrder } = trip.data;
  const earnings = (o?: { breakdown: { deliveryFeePaise: number; surgePaise: number; tipPaise?: number } } | null) =>
    o ? o.breakdown.deliveryFeePaise + o.breakdown.surgePaise + (o.breakdown.tipPaise ?? 0) : 0;

  const step = (next: "AT_PICKUP" | "PICKED_UP" | "AT_DROPOFF" | "COMPLETED", extra: { challengeCode?: string } = {}, ok?: string) =>
    run(() => api.riderUpdateMilestone({ assignmentId: assignment!.id, nextStatus: next, ...extra }), ok);

  return (
    <>
      <PortalHeader
        title="Delivery partner"
        right={
          <button
            disabled={busy || !!assignment}
            onClick={() => {
              unlockAudio();
              run(() => api.riderSetOnline(!online), online ? "You are offline" : "You are online");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black ${online ? "bg-success" : "bg-white/20"}`}
          >
            <Power className="w-4 h-4" /> {online ? "Online" : "Offline"}
          </button>
        }
      />
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {online && gpsError && <p className="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs font-semibold">{gpsError}</p>}

        {!assignment && !pendingOffer && (
          <div className="p-8 text-center rounded-3xl bg-surface-muted border border-border">
            <p className="text-lg font-black">{online ? "Looking for orders near you…" : "You are offline"}</p>
            <p className="text-sm text-text-secondary mt-1">
              {online ? "Keep this screen open. New requests will ring." : "Go online to start receiving delivery requests."}
            </p>
          </div>
        )}

        {!assignment && pendingOffer && offerOrder && (
          <section className="rounded-3xl border-2 border-brand p-5 space-y-4 bg-white shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">New delivery request</h2>
              <span className="flex items-center gap-1 text-sm">
                <Timer className="w-4 h-4" /> <OfferCountdown expiresAt={pendingOffer.expiresAt} />
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex gap-2">
                <Store className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <span>
                  <b>{offerOrder.restaurant.name}</b>
                  {pendingOffer.distanceToPickupMeters !== undefined && <span className="text-text-secondary"> · {formatDistance(pendingOffer.distanceToPickupMeters)} away</span>}
                </span>
              </p>
              <p className="flex gap-2">
                <MapPin className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" /> Drop: {offerOrder.deliveryAddress.street}
              </p>
              <p className="flex gap-2 font-bold text-success">
                <Wallet className="w-4 h-4 shrink-0 mt-0.5" /> Earn {formatRupees(earnings(offerOrder))}
              </p>
            </div>
            <div className="flex gap-3">
              <button disabled={busy} onClick={() => run(() => api.riderRejectOffer(pendingOffer.id))} className="flex-1 py-3 rounded-xl border border-border font-bold text-sm">
                Decline
              </button>
              <button disabled={busy} onClick={() => run(() => api.riderAcceptOffer(pendingOffer.id), "Trip accepted")} className="flex-[2] py-3 rounded-xl bg-success text-white font-black text-sm">
                Accept
              </button>
            </div>
          </section>
        )}

        {assignment && order && (
          <section className="rounded-3xl border border-border p-5 space-y-4 bg-white">
            <div className="flex items-center justify-between text-xs font-bold text-text-secondary">
              <span>#{order.orderNumber}</span>
              <span>Earn {formatRupees(earnings(order))}</span>
            </div>

            {(assignment.status === DeliveryTripStatus.ASSIGNED || assignment.status === DeliveryTripStatus.AT_PICKUP) && (
              <>
                <div>
                  <p className="text-xs uppercase font-bold text-text-secondary">Pick up from</p>
                  <p className="text-lg font-black">{order.restaurant.name}</p>
                  <CallButton orderId={order.orderId} target="RESTAURANT" label="Call restaurant" className="text-xs font-bold text-brand inline-flex items-center gap-1 mt-1" />
                </div>
                <ul className="text-sm bg-surface-muted rounded-xl p-3 space-y-1">
                  {order.items.map((i, idx) => (
                    <li key={idx}>
                      {i.quantity} × {i.name}
                      {i.variantName && ` (${i.variantName})`}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-secondary">Kitchen status: {order.fulfillmentState.replace(/_/g, " ").toLowerCase()}</p>
              </>
            )}

            {assignment.status === DeliveryTripStatus.ASSIGNED && pickupLocation && (
              <div className="flex gap-3">
                <a href={directionsUrl(pickupLocation)} target="_blank" rel="noreferrer" className="flex-1 py-3 rounded-xl border border-border font-bold text-sm flex items-center justify-center gap-2">
                  <Navigation className="w-4 h-4" /> Navigate
                </a>
                <button disabled={busy} onClick={() => step("AT_PICKUP")} className="flex-1 py-3 rounded-xl bg-brand text-white font-bold text-sm">
                  Reached restaurant
                </button>
              </div>
            )}

            {assignment.status === DeliveryTripStatus.AT_PICKUP && (
              <div className="space-y-2">
                {order.fulfillmentState !== "READY_FOR_PICKUP" && (
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="Pickup code from restaurant"
                    aria-label="Pickup code"
                    className="w-full p-3 text-center tracking-[0.4em] text-lg font-black bg-surface-muted border border-border rounded-xl"
                  />
                )}
                <button disabled={busy} onClick={() => step("PICKED_UP", { challengeCode: code || undefined }, "Order picked up")} className="w-full py-3 rounded-xl bg-brand text-white font-black text-sm">
                  Confirm pickup
                </button>
              </div>
            )}

            {(assignment.status === DeliveryTripStatus.PICKED_UP || assignment.status === DeliveryTripStatus.AT_DROPOFF) && (
              <>
                <div>
                  <p className="text-xs uppercase font-bold text-text-secondary">Deliver to</p>
                  <p className="text-base font-black">{order.deliveryAddress.building}</p>
                  <p className="text-sm text-text-secondary">{order.deliveryAddress.street}</p>
                  {order.deliveryAddress.landmark && <p className="text-xs text-text-secondary">Near {order.deliveryAddress.landmark}</p>}
                  {order.instructions && <p className="text-xs mt-1 bg-amber-50 text-amber-900 p-2 rounded-lg">{order.instructions}</p>}
                </div>
                <div className="flex gap-3">
                  <a href={directionsUrl(order.deliveryAddress)} target="_blank" rel="noreferrer" className="flex-1 py-3 rounded-xl border border-border font-bold text-sm flex items-center justify-center gap-2">
                    <Navigation className="w-4 h-4" /> Navigate
                  </a>
                  <CallButton
                    orderId={order.orderId}
                    target="CUSTOMER"
                    label="Call customer"
                    className="flex-1 py-3 rounded-xl border border-border font-bold text-sm flex items-center justify-center gap-2"
                  />
                </div>
              </>
            )}

            {assignment.status === DeliveryTripStatus.PICKED_UP && (
              <button disabled={busy} onClick={() => step("AT_DROPOFF")} className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm">
                Reached customer
              </button>
            )}

            {assignment.status === DeliveryTripStatus.AT_DROPOFF && (
              <div className="space-y-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Customer's OTP"
                  aria-label="Delivery OTP"
                  className="w-full p-3 text-center tracking-[0.5em] text-2xl font-black bg-surface-muted border border-border rounded-xl"
                />
                <button disabled={busy || code.length < 4} onClick={() => step("COMPLETED", { challengeCode: code }, "Delivered! Great job.")} className="w-full py-3 rounded-xl bg-success text-white font-black text-sm disabled:opacity-50">
                  Complete delivery
                </button>
                <button onClick={() => setFailOpen(true)} className="w-full text-xs text-text-secondary underline">
                  Customer unavailable?
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      <Modal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        size="sm"
        title="Mark delivery as failed"
        description="Allowed after waiting 10 minutes at the location and trying to call the customer."
        footer={
          <button
            disabled={busy}
            onClick={() => {
              setFailOpen(false);
              run(() => api.riderUpdateMilestone({ assignmentId: assignment!.id, nextStatus: "FAILED", failureReason: failReason }), "Reported to support");
            }}
            className="w-full py-3 rounded-xl bg-red-600 text-white font-bold text-sm"
          >
            Report failed delivery
          </button>
        }
      >
        <select value={failReason} onChange={(e) => setFailReason(e.target.value)} className="w-full p-3 rounded-xl border border-border text-sm">
          <option>Customer not reachable</option>
          <option>Wrong or incomplete address</option>
          <option>Customer refused the order</option>
          <option>Unsafe location</option>
        </select>
      </Modal>
    </>
  );
}

function RiderShell() {
  const api = useApi();
  const [tab, setTab] = useState<"trips" | "earnings">(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "earnings" ? "earnings" : "trips"
  );
  return (
    <>
      {tab === "trips" ? (
        <RiderApp />
      ) : (
        <>
          <PortalHeader title="Delivery partner" />
          <div className="max-w-lg mx-auto px-4 py-4">
            <EarningsPanel queryKey={["rider-earnings"]} load={() => api.getRiderEarnings()} saveAccount={(a) => api.saveRiderPayoutAccount(a)} />
          </div>
        </>
      )}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-border grid grid-cols-2 pb-[env(safe-area-inset-bottom)]" aria-label="Rider sections">
        {(["trips", "earnings"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`py-3 text-sm font-bold ${tab === t ? "text-brand" : "text-text-secondary"}`}>
            {t === "trips" ? "Trips" : "Earnings"}
          </button>
        ))}
      </nav>
      <div className="h-16" />
    </>
  );
}

export default function RiderPage() {
  return (
    <RoleGate roles={["RIDER"]} title="Delivery partner app">
      <RiderShell />
    </RoleGate>
  );
}

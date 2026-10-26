"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Bike, Clock, MapPin, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { STATE_LABELS, formatTime } from "@/lib/format";

interface PublicTracking {
  orderNumber: string;
  restaurantName: string;
  orderMode?: "DELIVERY" | "PICKUP";
  fulfillmentState: string;
  etaMinutes?: number;
  promisedDeliveryAt?: string;
  rider?: { firstName: string; location?: { latitude: number; longitude: number } };
  timeline: Array<{ state: string; at: string; actor: string }>;
  isTerminal: boolean;
  updatedAt: string;
}

const DELIVERY_STEPS = [
  ["AWAITING_MERCHANT", "Order placed"],
  ["ACCEPTED", "Confirmed"],
  ["PREPARING", "Preparing"],
  ["OUT_FOR_DELIVERY", "On the way"],
  ["DELIVERED", "Delivered"],
] as const;

const PICKUP_STEPS = [
  ["AWAITING_MERCHANT", "Order placed"],
  ["ACCEPTED", "Confirmed"],
  ["PREPARING", "Preparing"],
  ["READY_FOR_PICKUP", "Ready"],
  ["DELIVERED", "Collected"],
] as const;

function currentStep(state: string, isPickup: boolean): number {
  if (state === "DELIVERED") return 4;
  if (isPickup) {
    if (state === "READY_FOR_PICKUP") return 3;
    if (state === "PREPARING") return 2;
    if (state === "ACCEPTED") return 1;
    return 0;
  }
  if (state === "PICKED_UP" || state === "OUT_FOR_DELIVERY") return 3;
  if (state === "PREPARING" || state === "READY_FOR_PICKUP") return 2;
  if (state === "ACCEPTED") return 1;
  return 0;
}

export default function PublicTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicTracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/v1/track/${token}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error?.message ?? "This tracking link isn't available.");
          return;
        }
        setData(json.data);
      } catch {
        if (!cancelled) setError("We couldn't load this order. Check your connection.");
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-subtle">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-5">
          <Logo />
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5" /> Shared live status
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-10">
        {error ? (
          <div className="rounded-3xl bg-white p-8 text-center">
            <MapPin className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-4 text-lg font-semibold text-ink">Link unavailable</p>
            <p className="mt-2 text-sm text-ink-muted">{error}</p>
            <p className="mt-4 text-xs text-ink-muted">Tracking links expire after 24 hours for privacy.</p>
          </div>
        ) : !data ? (
          <div className="space-y-4">
            <div className="skeleton h-36" />
            <div className="skeleton h-64" />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-[28px] bg-white p-6">
              <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">
                {data.restaurantName} · #{data.orderNumber}
              </p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">
                  {STATE_LABELS[data.fulfillmentState] ?? data.fulfillmentState}
                </h1>
                {!data.isTerminal && data.etaMinutes ? (
                  <div className="text-right">
                    <p className="text-3xl font-semibold text-ink tabular">{data.etaMinutes}</p>
                    <p className="text-xs text-ink-muted">min away</p>
                  </div>
                ) : null}
              </div>
              {data.promisedDeliveryAt && !data.isTerminal && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
                  <Clock className="h-3.5 w-3.5" /> Expected around {formatTime(data.promisedDeliveryAt)}
                </p>
              )}
            </section>

            {data.rider && !data.isTerminal && (
              <section className="flex items-center gap-4 rounded-[28px] bg-white p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle">
                  <Bike className="h-5 w-5 text-ink" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{data.rider.firstName} is delivering</p>
                  <p className="text-xs text-ink-muted">Your delivery partner</p>
                </div>
              </section>
            )}

            <section className="rounded-[28px] bg-white p-6">
              <h2 className="text-sm font-semibold text-ink">Progress</h2>
              <ol className="mt-5">
                {(data.orderMode === "PICKUP" ? PICKUP_STEPS : DELIVERY_STEPS).map(([state, label], i) => {
                  const steps = data.orderMode === "PICKUP" ? PICKUP_STEPS : DELIVERY_STEPS;
                  const step = currentStep(data.fulfillmentState, data.orderMode === "PICKUP");
                  const done = i < step || data.fulfillmentState === "DELIVERED";
                  const current = i === step && !data.isTerminal;
                  const at = data.timeline.find((t) => t.state === state)?.at;
                  const last = i === steps.length - 1;
                  return (
                    <li key={state} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${done ? "bg-ink" : current ? "bg-accent" : "bg-line-strong"}`} />
                        {!last && <span className={`w-px flex-1 ${done ? "bg-ink" : "bg-line"}`} />}
                      </div>
                      <div className={`pb-6 ${last ? "pb-0" : ""}`}>
                        <p className={`text-sm ${done || current ? "font-medium text-ink" : "text-ink-muted"}`}>{label}</p>
                        {at && <p className="text-xs text-ink-muted">{formatTime(at)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <p className="text-center text-xs text-ink-muted">
              Privacy-safe: your address, contact number and payment details are never shown. Powered by BiteBox.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

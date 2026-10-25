"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Store, Volume2, VolumeX } from "lucide-react";
import { OrderDetailDto } from "@startup/contracts";
import { PortalBody, PortalHeader, RoleGate } from "@/components/portal/role-gate";
import { MenuEditor } from "@/components/merchant/menu-editor";
import { MerchantGrowthPanel } from "@/components/merchant/merchant-growth-panel";
import { OutletSettings } from "@/components/merchant/outlet-settings";
import { EarningsPanel } from "@/components/payouts/earnings-panel";
import { Modal } from "@/components/ui/modal";
import { Toggle } from "@/components/ui/field";
import { EmptyState, PageSpinner, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { playChime, unlockAudio } from "@/lib/alert-sound";
import { STATE_LABELS, formatRupees, formatTime, timeAgo } from "@/lib/format";

const PREP_OPTIONS = [10, 15, 20, 30, 45];
const REJECT_REASONS = ["Item(s) out of stock", "Kitchen is too busy", "Closing soon", "Cannot fulfil special request"];
const ORDER_POLL_MS = 5000;

function Countdown({ deadline }: { deadline?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const left = Math.max(0, Math.round((new Date(deadline).getTime() - now) / 1000));
  return <span className={`badge tabular ${left < 30 ? "animate-pulse bg-danger text-white" : "badge-warn"}`}>{left > 0 ? `${left}s left` : "Expired"}</span>;
}

function OrderCard({ order, restaurantId }: { order: OrderDetailDto; restaurantId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [prep, setPrep] = useState(15);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ["merchant-orders", restaurantId] });
    }
  };

  const state = order.fulfillmentState;
  const inKitchen = state === "ACCEPTED" || state === "PREPARING" || state === "READY_FOR_PICKUP";
  return (
    <article className={`space-y-5 rounded-3xl bg-white p-5 ${state === "AWAITING_MERCHANT" ? "shadow-pop ring-1 ring-ink" : "shadow-soft"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">#{order.orderNumber}</p>
          <p className="text-xs text-ink-muted">{timeAgo(order.createdAt)}</p>
        </div>
        {state === "AWAITING_MERCHANT" ? <Countdown deadline={order.merchantResponseDeadlineAt} /> : <span className="badge badge-neutral">{STATE_LABELS[state]}</span>}
      </div>

      <ul className="space-y-2.5 text-[15px]">
        {order.items.map((i, idx) => (
          <li key={idx}>
            <span className="font-semibold tabular text-ink">{i.quantity}×</span> <span className="text-ink">{i.name}</span>
            {i.variantName && <span className="text-ink-muted"> · {i.variantName}</span>}
            {i.selectedOptionNames.length > 0 && <span className="block text-sm text-ink-muted">+ {i.selectedOptionNames.join(", ")}</span>}
            {i.instructions && <span className="block text-sm font-medium text-warn">“{i.instructions}”</span>}
          </li>
        ))}
      </ul>
      {order.instructions && <p className="notice notice-warn">Note: {order.instructions}</p>}

      {inKitchen && order.pickupCode && (
        <div className="flex items-center justify-between rounded-2xl bg-subtle px-4 py-3 text-sm">
          <span className="text-ink-muted">
            Pickup code <b className="ml-1 text-base font-semibold tracking-widest text-ink">{order.pickupCode}</b>
          </span>
          {order.rider && <span className="text-ink-muted">{order.rider.name}</span>}
        </div>
      )}

      <p className="text-sm text-ink-muted">Item total {formatRupees(order.breakdown.subtotalPaise)}</p>

      {state === "AWAITING_MERCHANT" && (
        <div className="space-y-4 border-t border-line pt-5">
          <div>
            <p className="label">Ready in</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Preparation time">
              {PREP_OPTIONS.map((m) => (
                <button key={m} role="radio" aria-checked={prep === m} onClick={() => setPrep(m)} className="chip h-8 px-3 text-xs">
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => setRejecting(true)} className="btn btn-secondary">
              Reject
            </button>
            <button disabled={busy} onClick={() => run(() => api.merchantAcceptOrder(order.orderId, prep), "Order accepted")} className="btn btn-success flex-1">
              {busy && <Spinner />} Accept
            </button>
          </div>
        </div>
      )}
      {state === "ACCEPTED" && (
        <div className="flex gap-2 border-t border-line pt-5">
          <button disabled={busy} onClick={() => run(() => api.merchantMarkPreparing(order.orderId), "Marked as preparing")} className="btn btn-secondary flex-1">
            Start preparing
          </button>
          <button disabled={busy} onClick={() => run(() => api.merchantMarkReady(order.orderId), "Marked ready")} className="btn btn-primary flex-1">
            Food ready
          </button>
        </div>
      )}
      {state === "PREPARING" && (
        <div className="border-t border-line pt-5">
          <button disabled={busy} onClick={() => run(() => api.merchantMarkReady(order.orderId), "Marked ready")} className="btn btn-primary btn-block">
            Food ready for pickup
          </button>
        </div>
      )}
      {inKitchen && (
        <button onClick={() => setRejecting(true)} className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink">
          Can&apos;t fulfil this order?
        </button>
      )}

      <Modal open={rejecting} onClose={() => setRejecting(false)} size="sm" title="Why can't you take it?" description="The customer gets a full refund.">
        <ul className="-mx-3 pb-2">
          {REJECT_REASONS.map((r) => (
            <li key={r}>
              <button
                onClick={() => {
                  setRejecting(false);
                  run(() => api.merchantRejectOrder(order.orderId, r), "Order rejected");
                }}
                className="w-full rounded-2xl px-3 py-4 text-left text-[15px] text-ink transition-colors hover:bg-danger-soft hover:text-danger"
              >
                {r}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </article>
  );
}

type Tab = "live" | "menu" | "outlet" | "growth" | "earnings" | "history";
const ALL_STAFF = ["OWNER", "MANAGER", "KITCHEN", "CATALOG_EDITOR"];
const TABS: Array<{ id: Tab; label: string; roles: string[] }> = [
  { id: "live", label: "Live orders", roles: ALL_STAFF },
  { id: "menu", label: "Menu", roles: ALL_STAFF },
  { id: "history", label: "History", roles: ALL_STAFF },
  { id: "outlet", label: "Outlet & staff", roles: ["OWNER", "MANAGER"] },
  { id: "growth", label: "Growth", roles: ["OWNER"] },
  { id: "earnings", label: "Earnings", roles: ["OWNER"] },
];

function MerchantConsole() {
  const api = useApi();
  const toast = useToast();
  const restaurants = useQuery({ queryKey: ["merchant-restaurants"], queryFn: () => api.getMerchantRestaurants() });
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const params = useSearchParams();
  const [requestedTab, setTab] = useState<Tab>((TABS.find((t) => t.id === params.get("tab"))?.id ?? "live") as Tab);
  const [sound, setSound] = useState(false);
  const [togglingIntake, setTogglingIntake] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    if (!restaurantId && restaurants.data?.[0]) setRestaurantId(restaurants.data[0].id);
  }, [restaurants.data, restaurantId]);
  const restaurant = restaurants.data?.find((r) => r.id === restaurantId);
  const allowedTabs = TABS.filter((t) => restaurant && t.roles.includes(restaurant.staffRole));
  // A deep link to a tab this staff role can't use falls back to live orders
  const tab: Tab = allowedTabs.some((t) => t.id === requestedTab) ? requestedTab : "live";

  // Active orders are polled on every tab so new-order alerts still ring while staff edit the menu
  const liveOrders = useQuery({
    queryKey: ["merchant-orders", restaurantId, "active"],
    queryFn: () => api.getMerchantOrders(restaurantId!, "active"),
    enabled: !!restaurantId,
    refetchInterval: ORDER_POLL_MS,
    refetchIntervalInBackground: true,
  });
  const history = useQuery({
    queryKey: ["merchant-orders", restaurantId, "all"],
    queryFn: () => api.getMerchantOrders(restaurantId!, "all"),
    enabled: !!restaurantId && tab === "history",
  });

  // Browsers only allow audio after a user gesture; unlock on the first tap anywhere
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Reset alert state when switching outlets
  useEffect(() => {
    seen.current = new Set();
    primed.current = false;
  }, [restaurantId]);

  // New-order alert: chime + title badge for orders we have not seen yet
  useEffect(() => {
    if (!liveOrders.data) return;
    const fresh = liveOrders.data.filter((o) => o.fulfillmentState === "AWAITING_MERCHANT" && !seen.current.has(o.orderId));
    // The first load only establishes what's already on the board
    if (fresh.length > 0 && primed.current && sound) playChime();
    for (const o of liveOrders.data) seen.current.add(o.orderId);
    primed.current = true;
    const pending = liveOrders.data.filter((o) => o.fulfillmentState === "AWAITING_MERCHANT").length;
    document.title = pending ? `(${pending}) New order · BiteBox` : "Restaurant console · BiteBox";
  }, [liveOrders.data, sound]);
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);

  const columns = useMemo(() => {
    const list = liveOrders.data ?? [];
    return {
      new: list.filter((o) => o.fulfillmentState === "AWAITING_MERCHANT"),
      kitchen: list.filter((o) => o.fulfillmentState === "ACCEPTED" || o.fulfillmentState === "PREPARING"),
      ready: list.filter((o) => o.fulfillmentState === "READY_FOR_PICKUP"),
    };
  }, [liveOrders.data]);

  if (restaurants.isPending) return <PageSpinner />;
  if (!restaurants.data?.length) {
    return (
      <>
        <PortalHeader title="Restaurant console" />
        <EmptyState icon={<Store />} title="No restaurant linked" body="Ask your restaurant owner to add you as staff." />
      </>
    );
  }

  return (
    <>
      <PortalHeader
        title="Restaurant console"
        right={
          <button
            onClick={() => {
              unlockAudio();
              setSound(!sound);
            }}
            aria-label={sound ? "Mute new order alerts" : "Turn on new order alerts"}
            className={`btn btn-sm ${sound ? "btn-ghost" : "btn-primary animate-pulse"}`}
          >
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden sm:inline">{sound ? "Alerts on" : "Turn on alerts"}</span>
          </button>
        }
      />
      <PortalBody>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {restaurants.data.length > 1 ? (
            <select value={restaurantId ?? ""} onChange={(e) => setRestaurantId(e.target.value)} className="input h-11 w-auto min-w-[220px] font-medium" aria-label="Outlet">
              {restaurants.data.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="h-page">{restaurant?.name}</h1>
          )}
          {restaurant && (
            <div className="flex items-center gap-3 rounded-full bg-subtle py-1.5 pl-5 pr-1.5">
              <span className={`text-sm font-medium ${restaurant.isAcceptingOrders ? "text-success" : "text-ink-muted"}`}>
                {restaurant.isAcceptingOrders ? "Accepting orders" : "Paused"}
              </span>
              <Toggle
                label="Accepting orders"
                checked={restaurant.isAcceptingOrders}
                disabled={togglingIntake}
                onChange={async (next) => {
                  setTogglingIntake(true);
                  try {
                    await api.merchantSetAcceptingOrders(restaurant.id, next);
                    await restaurants.refetch();
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  } finally {
                    setTogglingIntake(false);
                  }
                }}
              />
            </div>
          )}
        </div>

        <div role="tablist" aria-label="Console sections" className="tabs mt-8">
          {allowedTabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="tab">
              {t.label}
              {t.id === "live" && columns.new.length > 0 && <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white tabular">{columns.new.length}</span>}
            </button>
          ))}
        </div>

        <div className="pt-8">
          {tab === "live" && restaurantId && (
            <>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {(
                  [
                    ["new", "New"],
                    ["kitchen", "In the kitchen"],
                    ["ready", "Ready for pickup"],
                  ] as const
                ).map(([key, title]) => (
                  <section key={key} className="panel min-h-[240px] p-4">
                    <h2 className="flex items-center justify-between px-2 pb-4 pt-1 text-sm font-semibold text-ink">
                      {title} <span className="text-ink-muted tabular">{columns[key].length}</span>
                    </h2>
                    <div className="space-y-3">
                      {columns[key].map((o) => (
                        <OrderCard key={o.orderId} order={o} restaurantId={restaurantId} />
                      ))}
                      {columns[key].length === 0 && <p className="py-12 text-center text-sm text-ink-muted">Nothing here</p>}
                    </div>
                  </section>
                ))}
              </div>
              <p className="mt-6 text-xs text-ink-muted">
                {liveOrders.isError ? `${errorMessage(liveOrders.error)} — retrying…` : "Updates every 5 seconds. Keep this tab open during service."}
              </p>
            </>
          )}
          {tab === "menu" && restaurant && <MenuEditor restaurantId={restaurant.id} canEdit={["OWNER", "MANAGER", "CATALOG_EDITOR"].includes(restaurant.staffRole)} />}
          {tab === "outlet" && restaurant && <OutletSettings key={restaurant.id} restaurantId={restaurant.id} isOwner={restaurant.staffRole === "OWNER"} />}
          {tab === "growth" && restaurant && <MerchantGrowthPanel restaurantId={restaurant.id} />}
          {tab === "earnings" && restaurant && (
            <div className="max-w-3xl">
              <EarningsPanel
                queryKey={["merchant-earnings", restaurant.id]}
                load={() => api.getMerchantEarnings(restaurant.id)}
                saveAccount={(account) => api.saveMerchantPayoutAccount(restaurant.id, account)}
              />
            </div>
          )}
          {tab === "history" &&
            (history.isPending ? (
              <div className="skeleton h-48" />
            ) : (history.data ?? []).length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <ul className="rows max-w-3xl">
                {(history.data ?? []).map((o) => (
                  <li key={o.orderId} className="flex items-center justify-between gap-4 py-4">
                    <span>
                      <span className="font-medium text-ink">#{o.orderNumber}</span>
                      <span className="text-ink-muted"> · {o.items.reduce((n, i) => n + i.quantity, 0)} items</span>
                      <span className="block text-xs text-ink-muted">{formatTime(o.createdAt)}</span>
                    </span>
                    <span className="badge badge-neutral">{STATE_LABELS[o.fulfillmentState]}</span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </PortalBody>
    </>
  );
}

export default function MerchantPage() {
  return (
    <RoleGate roles={["MERCHANT_STAFF"]} title="Restaurant console">
      <React.Suspense>
        <MerchantConsole />
      </React.Suspense>
    </RoleGate>
  );
}

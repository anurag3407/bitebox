"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChefHat, Clock, KeyRound, Package, Volume2, VolumeX, X } from "lucide-react";
import { OrderDetailDto } from "@startup/contracts";
import { PortalHeader, RoleGate } from "@/components/portal/role-gate";
import { MenuEditor } from "@/components/merchant/menu-editor";
import { OutletSettings } from "@/components/merchant/outlet-settings";
import { EarningsPanel } from "@/components/payouts/earnings-panel";
import { useSearchParams } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { playChime, unlockAudio } from "@/lib/alert-sound";
import { STATE_LABELS, formatRupees, formatTime, timeAgo } from "@/lib/format";

const PREP_OPTIONS = [10, 15, 20, 30, 45];
const REJECT_REASONS = ["Item(s) out of stock", "Kitchen is too busy", "Closing soon", "Cannot fulfil special request"];

function Countdown({ deadline }: { deadline?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const left = Math.max(0, Math.round((new Date(deadline).getTime() - now) / 1000));
  return (
    <span className={`text-xs font-black px-2 py-1 rounded-lg ${left < 30 ? "bg-red-600 text-white animate-pulse" : "bg-amber-100 text-amber-900"}`}>
      {left > 0 ? `${left}s to accept` : "Expired"}
    </span>
  );
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
  return (
    <article className="bg-white rounded-2xl border border-border p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-text-secondary">#{order.orderNumber}</p>
          <p className="text-[11px] text-text-secondary">{timeAgo(order.createdAt)}</p>
        </div>
        {state === "AWAITING_MERCHANT" ? <Countdown deadline={order.merchantResponseDeadlineAt} /> : <span className="text-[11px] font-bold text-text-secondary">{STATE_LABELS[state]}</span>}
      </div>

      <ul className="space-y-1.5 text-sm">
        {order.items.map((i, idx) => (
          <li key={idx}>
            <span className="font-bold">{i.quantity} ×</span> {i.name}
            {i.variantName && <span className="text-text-secondary"> · {i.variantName}</span>}
            {i.selectedOptionNames.length > 0 && <span className="block text-[11px] text-text-secondary">+ {i.selectedOptionNames.join(", ")}</span>}
            {i.instructions && <span className="block text-[11px] text-amber-800 font-semibold">“{i.instructions}”</span>}
          </li>
        ))}
      </ul>
      {order.instructions && <p className="text-xs bg-amber-50 text-amber-900 p-2 rounded-lg">Note: {order.instructions}</p>}
      <p className="text-xs text-text-secondary">Item total {formatRupees(order.breakdown.subtotalPaise)}</p>

      {(state === "ACCEPTED" || state === "PREPARING" || state === "READY_FOR_PICKUP") && order.pickupCode && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-muted text-xs">
          <KeyRound className="w-4 h-4 text-brand" /> Pickup code <b className="tracking-widest text-sm">{order.pickupCode}</b>
          {order.rider && <span className="ml-auto text-text-secondary">Rider: {order.rider.name}</span>}
        </div>
      )}

      {state === "AWAITING_MERCHANT" && (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Preparation time">
            {PREP_OPTIONS.map((m) => (
              <button key={m} role="radio" aria-checked={prep === m} onClick={() => setPrep(m)} className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${prep === m ? "bg-text-primary text-white border-text-primary" : "border-border"}`}>
                {m}m
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => setRejecting(true)} className="px-3 py-2.5 rounded-xl border border-red-200 text-red-700 text-sm font-bold">
              Reject
            </button>
            <button disabled={busy} onClick={() => run(() => api.merchantAcceptOrder(order.orderId, prep), "Order accepted")} className="flex-1 py-2.5 rounded-xl bg-success text-white text-sm font-black flex items-center justify-center gap-2">
              {busy && <Spinner />} Accept · {prep} min
            </button>
          </div>
        </div>
      )}
      {state === "ACCEPTED" && (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => run(() => api.merchantMarkPreparing(order.orderId), "Marked as preparing")} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold">
            Start preparing
          </button>
          <button disabled={busy} onClick={() => run(() => api.merchantMarkReady(order.orderId), "Marked ready")} className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
            Food ready
          </button>
        </div>
      )}
      {state === "PREPARING" && (
        <button disabled={busy} onClick={() => run(() => api.merchantMarkReady(order.orderId), "Marked ready")} className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
          Food ready for pickup
        </button>
      )}
      {(state === "ACCEPTED" || state === "PREPARING" || state === "READY_FOR_PICKUP") && (
        <button onClick={() => setRejecting(true)} className="text-[11px] text-text-secondary underline">
          Can&apos;t fulfil this order?
        </button>
      )}

      <Modal open={rejecting} onClose={() => setRejecting(false)} size="sm" title="Reject order" description="The customer will be refunded in full.">
        <ul className="space-y-2">
          {REJECT_REASONS.map((r) => (
            <li key={r}>
              <button
                onClick={() => {
                  setRejecting(false);
                  run(() => api.merchantRejectOrder(order.orderId, r), "Order rejected");
                }}
                className="w-full text-left p-3 rounded-xl border border-border hover:border-red-300 text-sm"
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

type Tab = "live" | "menu" | "outlet" | "earnings" | "history";
const ALL_STAFF = ["OWNER", "MANAGER", "KITCHEN", "CATALOG_EDITOR"];
const TABS: Array<{ id: Tab; label: string; roles: string[] }> = [
  { id: "live", label: "Live orders", roles: ALL_STAFF },
  { id: "menu", label: "Menu", roles: ALL_STAFF },
  { id: "outlet", label: "Outlet & staff", roles: ["OWNER", "MANAGER"] },
  { id: "earnings", label: "Earnings", roles: ["OWNER"] },
  { id: "history", label: "History", roles: ALL_STAFF },
];

function MerchantConsole() {
  const api = useApi();
  const toast = useToast();
  const restaurants = useQuery({ queryKey: ["merchant-restaurants"], queryFn: () => api.getMerchantRestaurants() });
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t.id === params.get("tab"))?.id ?? "live") as Tab);
  const [sound, setSound] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!restaurantId && restaurants.data?.[0]) setRestaurantId(restaurants.data[0].id);
  }, [restaurants.data, restaurantId]);
  const restaurant = restaurants.data?.find((r) => r.id === restaurantId);

  const orders = useQuery({
    queryKey: ["merchant-orders", restaurantId, tab],
    queryFn: () => api.getMerchantOrders(restaurantId!, tab === "history" ? "all" : "active"),
    enabled: !!restaurantId && (tab === "live" || tab === "history"),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // New-order alert: chime + title flash for orders we have not seen yet
  useEffect(() => {
    const fresh = (orders.data ?? []).filter((o) => o.fulfillmentState === "AWAITING_MERCHANT" && !seen.current.has(o.orderId));
    if (fresh.length > 0 && seen.current.size > 0 && sound) playChime();
    for (const o of orders.data ?? []) seen.current.add(o.orderId);
    const pending = (orders.data ?? []).filter((o) => o.fulfillmentState === "AWAITING_MERCHANT").length;
    document.title = pending ? `(${pending}) New order! · Restaurant` : "Restaurant console";
  }, [orders.data, sound]);

  const columns = useMemo(() => {
    const list = orders.data ?? [];
    return {
      new: list.filter((o) => o.fulfillmentState === "AWAITING_MERCHANT"),
      kitchen: list.filter((o) => o.fulfillmentState === "ACCEPTED" || o.fulfillmentState === "PREPARING"),
      ready: list.filter((o) => o.fulfillmentState === "READY_FOR_PICKUP"),
    };
  }, [orders.data]);

  if (restaurants.isPending) return <div className="p-10 text-center"><Spinner /></div>;
  if (!restaurants.data?.length) return <EmptyState title="No restaurant linked" body="Ask your restaurant owner to add you as staff." />;

  return (
    <>
      <PortalHeader
        title="Restaurant console"
        right={
          <>
            <button
              onClick={() => {
                unlockAudio();
                setSound(!sound);
              }}
              aria-label={sound ? "Mute new order alerts" : "Enable new order alerts"}
              className={`p-2 rounded-lg ${sound ? "bg-white/20" : "bg-amber-500 animate-pulse"}`}
              title={sound ? "Alerts on" : "Tap to enable order alert sound"}
            >
              {sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </>
        }
      />
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <select value={restaurantId ?? ""} onChange={(e) => setRestaurantId(e.target.value)} className="px-3 py-2 rounded-xl border border-border text-sm font-bold">
            {restaurants.data.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {restaurant && (
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <span className={restaurant.isAcceptingOrders ? "text-success" : "text-red-700"}>{restaurant.isAcceptingOrders ? "Accepting orders" : "Paused"}</span>
              <input
                type="checkbox"
                role="switch"
                checked={restaurant.isAcceptingOrders}
                onChange={async (e) => {
                  try {
                    await api.merchantSetAcceptingOrders(restaurant.id, e.target.checked);
                    restaurants.refetch();
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
                className="w-5 h-5 accent-[#24963F]"
              />
            </label>
          )}
        </div>

        <nav className="flex gap-2 overflow-x-auto">
          {TABS.filter((t) => restaurant && t.roles.includes(restaurant.staffRole)).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border ${tab === t.id ? "bg-brand text-white border-brand" : "border-border"}`}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "live" && restaurantId && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {([
              ["new", "New", Bell],
              ["kitchen", "In the kitchen", ChefHat],
              ["ready", "Ready for pickup", Package],
            ] as const).map(([key, title, Icon]) => (
              <section key={key} className="bg-surface-muted rounded-3xl p-3 min-h-[200px]">
                <h2 className="text-sm font-black flex items-center gap-2 px-1 mb-3">
                  <Icon className="w-4 h-4" /> {title} <span className="text-text-secondary">({columns[key].length})</span>
                </h2>
                <div className="space-y-3">
                  {columns[key].map((o) => (
                    <OrderCard key={o.orderId} order={o} restaurantId={restaurantId} />
                  ))}
                  {columns[key].length === 0 && <p className="text-xs text-text-secondary text-center py-8">Nothing here</p>}
                </div>
              </section>
            ))}
          </div>
        )}
        {tab === "menu" && restaurant && <MenuEditor restaurantId={restaurant.id} canEdit={["OWNER", "MANAGER", "CATALOG_EDITOR"].includes(restaurant.staffRole)} />}
        {tab === "outlet" && restaurant && <OutletSettings key={restaurant.id} restaurantId={restaurant.id} isOwner={restaurant.staffRole === "OWNER"} />}
        {tab === "earnings" && restaurant && (
          <EarningsPanel
            queryKey={["merchant-earnings", restaurant.id]}
            load={() => api.getMerchantEarnings(restaurant.id)}
            saveAccount={(account) => api.saveMerchantPayoutAccount(restaurant.id, account)}
          />
        )}
        {tab === "history" && (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
            {(orders.data ?? []).map((o) => (
              <li key={o.orderId} className="p-3 flex items-center justify-between text-sm">
                <span>
                  <b>#{o.orderNumber}</b> · {o.items.reduce((n, i) => n + i.quantity, 0)} items
                  <span className="block text-[11px] text-text-secondary">{formatTime(o.createdAt)}</span>
                </span>
                <span className="text-xs font-bold">{STATE_LABELS[o.fulfillmentState]}</span>
              </li>
            ))}
          </ul>
        )}
        {orders.isError && (
          <p className="text-xs text-red-700 flex items-center gap-1">
            <X className="w-3 h-3" /> {errorMessage(orders.error)} — retrying…
          </p>
        )}
        <p className="text-[11px] text-text-secondary flex items-center gap-1">
          <Clock className="w-3 h-3" /> Auto-refreshing every 5 seconds. Keep this tab open during service hours.
        </p>
      </div>
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

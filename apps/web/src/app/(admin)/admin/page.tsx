"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { FulfillmentState } from "@startup/contracts";
import type { AdminOrderRow } from "@startup/api-client";
import { PortalHeader, RoleGate } from "@/components/portal/role-gate";
import { ApplicationsTab } from "@/components/admin/applications";
import { PayoutsTab } from "@/components/admin/payouts";
import { SupportTab } from "@/components/admin/support";
import { UsersTab } from "@/components/admin/users";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { STATE_LABELS, formatDateTime, formatRupees, formatTime, timeAgo } from "@/lib/format";

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`p-4 rounded-2xl border ${warn ? "border-red-300 bg-red-50" : "border-border bg-white"}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
}

function OrderDrawer({ order, onClose }: { order: AdminOrderRow; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fullDetail = useQuery({
    queryKey: ["admin-order-detail", order.orderId],
    queryFn: () => api.getAdminOrderDetail(order.orderId),
  });
  const riders = useQuery({ queryKey: ["admin-riders"], queryFn: () => api.getAdminRiders() });
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);

  const refundable = order.payablePaise - order.refundedPaise;
  const act = async (fn: () => Promise<void>, ok: string) => {
    if (reason.trim().length < 3) {
      toast("Add a reason (at least 3 characters) for the audit trail", "error");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      fullDetail.refetch();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const amountPaise = amount ? Math.round(Number(amount) * 100) : undefined;
  const dispatchable = ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"].includes(order.fulfillmentState) && !order.riderName;

  return (
    <Modal open onClose={onClose} size="lg" title={`Order #${order.orderNumber}`} description={`${order.restaurantName} · ${STATE_LABELS[order.fulfillmentState]} · ${order.paymentStatus}`}>
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Paid" value={formatRupees(order.payablePaise)} />
          <Stat label="Refunded" value={formatRupees(order.refundedPaise)} />
        </div>

        <section>
          <h3 className="font-bold mb-2">Timeline</h3>
          {fullDetail.isPending ? (
            <Spinner />
          ) : (
            <ol className="space-y-1.5 text-xs">
              {fullDetail.data?.events.map((e) => (
                <li key={e.sequence} className="flex gap-2">
                  <span className="text-text-secondary w-16 shrink-0">{formatTime(e.createdAt)}</span>
                  <span>
                    <b>{STATE_LABELS[e.targetState] ?? e.targetState}</b> · {e.actorType.toLowerCase()}
                    {e.reason && <span className="text-text-secondary"> — {e.reason}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {(fullDetail.data?.refunds.length ?? 0) > 0 && (
          <section>
            <h3 className="font-bold mb-2">Refunds</h3>
            <ul className="space-y-1 text-xs">
              {fullDetail.data!.refunds.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>
                    {formatRupees(r.amountPaise)} · {r.reason}
                  </span>
                  <span className={`font-bold ${r.status === "FAILED" ? "text-red-700" : r.status === "PROCESSED" ? "text-success" : ""}`}>{r.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2 p-4 rounded-2xl bg-surface-muted">
          <h3 className="font-bold">Support actions</h3>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, saved to audit log)" className="w-full p-2.5 rounded-xl border border-border bg-white" />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            placeholder={`Refund amount in ₹ (max ${formatRupees(refundable)}; blank = full)`}
            className="w-full p-2.5 rounded-xl border border-border bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || refundable <= 0 || !amountPaise}
              onClick={() => act(() => api.adminRefundOrder(order.orderId, amountPaise!, reason), "Refund issued")}
              className="px-3 py-2 rounded-xl bg-text-primary text-white text-xs font-bold disabled:opacity-40"
            >
              Refund amount
            </button>
            <button
              disabled={busy || ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"].includes(order.fulfillmentState)}
              onClick={() => act(() => api.adminCancelOrder(order.orderId, reason, amountPaise), "Order cancelled")}
              className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-40"
            >
              Cancel order {amountPaise === undefined ? "(full refund)" : `(refund ${formatRupees(amountPaise)})`}
            </button>
          </div>
          {dispatchable && (
            <div className="flex gap-2 pt-2">
              <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className="flex-1 p-2.5 rounded-xl border border-border bg-white text-xs">
                <option value="">Assign a rider manually…</option>
                {riders.data
                  ?.filter((r) => r.isOnline && !r.activeOrderId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · last seen {timeAgo(r.lastPingAt)}
                    </option>
                  ))}
              </select>
              <button
                disabled={busy || !riderId}
                onClick={() => act(() => api.adminAssignRider(order.orderId, riderId, reason), "Rider assigned")}
                className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold disabled:opacity-40"
              >
                Assign
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

type AdminTab = "orders" | "support" | "applications" | "users" | "payouts";
const ADMIN_TABS: Array<[AdminTab, string]> = [
  ["orders", "Orders"],
  ["support", "Support"],
  ["applications", "Partner applications"],
  ["users", "Users & roles"],
  ["payouts", "Payouts"],
];

function AdminConsole() {
  const [tab, setTab] = useState<AdminTab>("orders");
  return (
    <>
      <PortalHeader title="Operations" />
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <nav className="flex gap-2 overflow-x-auto">
          {ADMIN_TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border ${tab === id ? "bg-brand text-white border-brand" : "border-border"}`}>
              {label}
            </button>
          ))}
        </nav>
      </div>
      {tab === "orders" && <OrdersBoard />}
      {tab !== "orders" && (
        <div className="max-w-7xl mx-auto px-4 py-5">
          {tab === "support" && <SupportTab />}
          {tab === "applications" && <ApplicationsTab />}
          {tab === "users" && <UsersTab />}
          {tab === "payouts" && <PayoutsTab />}
        </div>
      )}
    </>
  );
}

function OrdersBoard() {
  const api = useApi();
  const [state, setState] = useState<FulfillmentState | "">("");
  const [stuck, setStuck] = useState(false);
  const [selected, setSelected] = useState<AdminOrderRow | null>(null);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.getAdminOverview(), refetchInterval: 15_000 });
  const orders = useQuery({
    queryKey: ["admin-orders", state, stuck],
    queryFn: () => api.getAdminOrders({ state: state || undefined, stuck: stuck || undefined }),
    refetchInterval: 10_000,
  });

  const o = overview.data;
  const failedJobs = (o?.jobs ?? []).filter((j: { status: string }) => j.status === "FAILED").reduce((n: number, j: { count: number }) => n + j.count, 0);

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-5 space-y-6">
        {o && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Stat label="Paid orders (24h)" value={o.last24h.paidOrders} />
            <Stat label="GMV (24h)" value={formatRupees(o.last24h.gmvPaise)} />
            <Stat label="Median delivery" value={o.last24h.medianDeliveryMinutes ? `${o.last24h.medianDeliveryMinutes}m` : "—"} />
            <Stat label="Riders online / fresh" value={`${o.fleet.online} / ${o.fleet.fresh}`} warn={o.fleet.fresh === 0} />
            <Stat label="Outbox backlog" value={o.outbox.pending} warn={(o.outbox.oldestPendingSeconds ?? 0) > 120} />
            <Stat
              label="Ledger"
              value={
                o.ledger.balanced ? (
                  <span className="flex items-center gap-1 text-success text-base">
                    <CheckCircle2 className="w-5 h-5" /> Balanced
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-700 text-base">
                    <AlertTriangle className="w-5 h-5" /> Imbalanced
                  </span>
                )
              }
              warn={!o.ledger.balanced}
            />
            {failedJobs > 0 && <Stat label="Failed jobs" value={failedJobs} warn />}
            {o.last24h.failedAfterPayment > 0 && <Stat label="Paid but failed (24h)" value={o.last24h.failedAfterPayment} warn />}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <select value={state} onChange={(e) => setState(e.target.value as FulfillmentState | "")} className="px-3 py-2 rounded-xl border border-border text-sm">
            <option value="">All states</option>
            {Object.values(FulfillmentState).map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={stuck} onChange={(e) => setStuck(e.target.checked)} className="w-4 h-4" /> Only delayed / stuck orders
          </label>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-xs text-text-secondary text-left">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Restaurant</th>
                <th className="p-3">State</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Rider</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.data?.map((row) => (
                <tr key={row.orderId} onClick={() => setSelected(row)} className="hover:bg-surface-muted cursor-pointer">
                  <td className="p-3 font-bold">#{row.orderNumber}</td>
                  <td className="p-3">{row.restaurantName}</td>
                  <td className="p-3">{STATE_LABELS[row.fulfillmentState]}</td>
                  <td className="p-3 text-xs">{row.paymentStatus}</td>
                  <td className="p-3 text-xs">{row.riderName ?? "—"}</td>
                  <td className="p-3 text-right">{formatRupees(row.payablePaise)}</td>
                  <td className="p-3 text-xs text-text-secondary">{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
              {orders.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-text-secondary">
                    No orders match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <OrderDrawer order={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export default function AdminPage() {
  return (
    <RoleGate roles={["ADMIN"]} title="Operations console">
      <AdminConsole />
    </RoleGate>
  );
}

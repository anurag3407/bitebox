"use client";

import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { FulfillmentState } from "@startup/contracts";
import type { AdminOrderRow } from "@startup/api-client";
import { PortalBody, PortalHeader, RoleGate } from "@/components/portal/role-gate";
import { ApplicationsTab } from "@/components/admin/applications";
import { IssuesTab } from "@/components/admin/issues";
import { KycTab } from "@/components/admin/kyc";
import { AdminOperationsTab } from "@/components/admin/operations";
import { AdminCorporateTab } from "@/components/admin/corporate";
import { AdminInsuranceTab } from "@/components/admin/insurance";
import { PayoutsTab } from "@/components/admin/payouts";
import { ReferralsTab } from "@/components/admin/referrals";
import { SupportTab } from "@/components/admin/support";
import { UsersTab } from "@/components/admin/users";
import { Field, MoneyInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { STATE_LABELS, formatDateTime, formatRupees, formatTime, timeAgo } from "@/lib/format";

const TERMINAL = ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"];

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
  const [amountPaise, setAmountPaise] = useState(0);
  const [riderId, setRiderId] = useState("");
  const [busy, setBusy] = useState(false);

  const refundable = order.payablePaise - order.refundedPaise;
  const reasonOk = reason.trim().length >= 3;
  const act = async (fn: () => Promise<void>, ok: string) => {
    if (!reasonOk) {
      toast("Add a reason (at least 3 characters) for the audit trail", "error");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
      setAmountPaise(0);
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      fullDetail.refetch();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const partial = amountPaise > 0 ? amountPaise : undefined;
  const dispatchable = ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"].includes(order.fulfillmentState) && !order.riderName;

  return (
    <Modal open onClose={onClose} size="lg" title={`Order #${order.orderNumber}`} description={`${order.restaurantName} · ${STATE_LABELS[order.fulfillmentState]} · ${order.paymentStatus}`}>
      <div className="space-y-10 pb-2 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Paid" value={formatRupees(order.payablePaise)} />
          <Stat label="Refunded" value={formatRupees(order.refundedPaise)} />
        </div>

        <section>
          <h3 className="text-[15px] font-semibold text-ink">Timeline</h3>
          {fullDetail.isPending ? (
            <Spinner className="mt-4 h-4 w-4" />
          ) : (
            <ol className="mt-4 space-y-3">
              {fullDetail.data?.events.map((e) => (
                <li key={e.sequence} className="flex gap-4">
                  <span className="w-16 shrink-0 text-ink-muted tabular">{formatTime(e.createdAt)}</span>
                  <span className="text-ink">
                    {STATE_LABELS[e.targetState] ?? e.targetState} <span className="text-ink-muted">· {e.actorType.toLowerCase()}</span>
                    {e.reason && <span className="block text-ink-muted">{e.reason}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {(fullDetail.data?.refunds.length ?? 0) > 0 && (
          <section>
            <h3 className="text-[15px] font-semibold text-ink">Refunds</h3>
            <ul className="rows mt-2">
              {fullDetail.data!.refunds.map((r) => (
                <li key={r.id} className="flex justify-between gap-4 py-3">
                  <span className="text-ink">
                    <span className="tabular">{formatRupees(r.amountPaise)}</span> <span className="text-ink-muted">· {r.reason}</span>
                  </span>
                  <span className={`badge ${r.status === "FAILED" ? "badge-danger" : r.status === "PROCESSED" ? "badge-success" : "badge-neutral"}`}>{r.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel space-y-5 p-6">
          <h3 className="text-[15px] font-semibold text-ink">Support actions</h3>
          <Field label="Reason" hint="Required. Saved to the audit log.">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input bg-white" />
          </Field>
          <Field label="Amount" hint={`Up to ${formatRupees(refundable)}. Leave empty to cancel with a full refund.`}>
            <MoneyInput paise={amountPaise} onChange={setAmountPaise} className="input bg-white" ariaLabel="Refund amount" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || refundable <= 0 || !partial || partial > refundable || !reasonOk}
              onClick={() => act(() => api.adminRefundOrder(order.orderId, partial!, reason), "Refund issued")}
              className="btn btn-primary"
            >
              Refund {partial ? formatRupees(partial) : ""}
            </button>
            <button
              disabled={busy || TERMINAL.includes(order.fulfillmentState) || !reasonOk}
              onClick={() => act(() => api.adminCancelOrder(order.orderId, reason, partial), "Order cancelled")}
              className="btn btn-danger-ghost"
            >
              Cancel order {partial === undefined ? "· full refund" : `· refund ${formatRupees(partial)}`}
            </button>
          </div>
          {dispatchable && (
            <div className="flex gap-2 border-t border-line pt-5">
              <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className="input min-w-0 flex-1 bg-white" aria-label="Rider">
                <option value="">Assign a rider manually…</option>
                {riders.data
                  ?.filter((r) => r.isOnline && !r.activeOrderId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · seen {timeAgo(r.lastPingAt)}
                    </option>
                  ))}
              </select>
              <button disabled={busy || !riderId || !reasonOk} onClick={() => act(() => api.adminAssignRider(order.orderId, riderId, reason), "Rider assigned")} className="btn btn-primary h-12">
                Assign
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

type AdminTab = "orders" | "support" | "issues" | "kyc" | "applications" | "referrals" | "users" | "payouts" | "operations" | "corporate" | "insurance";
const ADMIN_TABS: Array<[AdminTab, string]> = [
  ["orders", "Orders"],
  ["support", "Support"],
  ["issues", "Problems"],
  ["kyc", "Rider KYC"],
  ["applications", "Applications"],
  ["referrals", "Referrals"],
  ["users", "Users"],
  ["payouts", "Payouts"],
  ["operations", "Ops"],
  ["corporate", "Corporate"],
  ["insurance", "Insurance"],
];

function AdminConsole() {
  const [tab, setTab] = useState<AdminTab>("orders");
  return (
    <>
      <PortalHeader title="Operations" />
      <PortalBody>
        <div role="tablist" aria-label="Operations sections" className="tabs">
          {ADMIN_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="tab">
              {label}
            </button>
          ))}
        </div>
        <div className="pt-8">
          {tab === "orders" && <OrdersBoard />}
          {tab === "support" && <SupportTab />}
          {tab === "issues" && <IssuesTab />}
          {tab === "kyc" && <KycTab />}
          {tab === "applications" && <ApplicationsTab />}
          {tab === "referrals" && <ReferralsTab />}
          {tab === "users" && <UsersTab />}
          {tab === "payouts" && <PayoutsTab />}
          {tab === "operations" && <AdminOperationsTab />}
          {tab === "corporate" && <AdminCorporateTab />}
          {tab === "insurance" && <AdminInsuranceTab />}
        </div>
      </PortalBody>
    </>
  );
}

function OrdersBoard() {
  const api = useApi();
  const [state, setState] = useState<FulfillmentState | "">("");
  const [stuck, setStuck] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.getAdminOverview(), refetchInterval: 15_000 });
  const orders = useQuery({
    queryKey: ["admin-orders", state, stuck],
    queryFn: () => api.getAdminOrders({ state: state || undefined, stuck: stuck || undefined }),
    refetchInterval: 10_000,
  });
  // Read the row from the live list so the drawer reflects refunds and state changes; keep the
  // last copy if a refetch filters it out (e.g. it left the selected state) so the drawer stays open
  const lastSelected = useRef<AdminOrderRow | null>(null);
  const fresh = orders.data?.find((o) => o.orderId === selectedId);
  if (fresh) lastSelected.current = fresh;
  const selected = selectedId ? (fresh ?? (lastSelected.current?.orderId === selectedId ? lastSelected.current : null)) : null;

  const o = overview.data;
  const failedJobs = (o?.jobs ?? []).filter((j: { status: string }) => j.status === "FAILED").reduce((n: number, j: { count: number }) => n + j.count, 0);

  return (
    <div className="space-y-10">
      {o && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Paid orders · 24h" value={o.last24h.paidOrders} />
          <Stat label="GMV · 24h" value={formatRupees(o.last24h.gmvPaise)} />
          <Stat label="Median delivery" value={o.last24h.medianDeliveryMinutes ? `${o.last24h.medianDeliveryMinutes} min` : "—"} />
          <Stat label="Riders online / fresh" value={`${o.fleet.online} / ${o.fleet.fresh}`} tone={o.fleet.fresh === 0 ? "bad" : undefined} />
          <Stat label="Outbox backlog" value={o.outbox.pending} tone={(o.outbox.oldestPendingSeconds ?? 0) > 120 ? "bad" : undefined} />
          <Stat
            label="Ledger"
            tone={o.ledger.balanced ? "good" : "bad"}
            value={
              <span className="flex items-center gap-2 text-lg">
                {o.ledger.balanced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                {o.ledger.balanced ? "Balanced" : "Imbalanced"}
              </span>
            }
          />
          {failedJobs > 0 && <Stat label="Failed jobs" value={failedJobs} tone="bad" />}
          {o.last24h.failedAfterPayment > 0 && <Stat label="Paid but failed · 24h" value={o.last24h.failedAfterPayment} tone="bad" />}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={state} onChange={(e) => setState(e.target.value as FulfillmentState | "")} className="input h-10 w-auto rounded-full text-sm" aria-label="Filter by state">
            <option value="">All states</option>
            {Object.values(FulfillmentState).map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
          <button aria-pressed={stuck} onClick={() => setStuck(!stuck)} className="chip h-10">
            Delayed or stuck only
          </button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th className="py-3 pr-4 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Rider</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="py-3 pl-4 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.data?.map((row) => (
                <tr
                  key={row.orderId}
                  onClick={() => setSelectedId(row.orderId)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(row.orderId)}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-subtle focus-visible:bg-subtle"
                >
                  <td className="py-3.5 pr-4 font-medium text-ink">#{row.orderNumber}</td>
                  <td className="px-4 py-3.5 text-ink">{row.restaurantName}</td>
                  <td className="px-4 py-3.5 text-ink-soft">{STATE_LABELS[row.fulfillmentState]}</td>
                  <td className="px-4 py-3.5 text-xs text-ink-muted">{row.paymentStatus}</td>
                  <td className="px-4 py-3.5 text-ink-soft">{row.riderName ?? "—"}</td>
                  <td className="px-4 py-3.5 text-right text-ink tabular">{formatRupees(row.payablePaise)}</td>
                  <td className="py-3.5 pl-4 text-ink-muted">{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
              {orders.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-ink-muted">
                    No orders match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {orders.isPending && <div className="skeleton mt-4 h-40" />}
        </div>
      </div>
      {selected && <OrderDrawer key={selected.orderId} order={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RoleGate roles={["ADMIN"]} title="Operations console">
      <AdminConsole />
    </RoleGate>
  );
}

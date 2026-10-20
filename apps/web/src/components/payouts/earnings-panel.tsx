"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Wallet } from "lucide-react";
import type { Earnings } from "@startup/api-client";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const STATUS: Record<string, string> = {
  PENDING: "Scheduled",
  MANUAL: "Bank transfer pending",
  PROCESSING: "In transit",
  PAID: "Paid",
  FAILED: "Failed — support notified",
};

/** Earnings, bank account and payout history; shared by merchant owners and riders. */
export function EarningsPanel({
  queryKey,
  load,
  saveAccount,
}: {
  queryKey: unknown[];
  load: () => Promise<Earnings>;
  saveAccount: (account: { accountHolderName: string; ifsc: string; accountNumber: string }) => Promise<{ accountLast4: string }>;
}) {
  const toast = useToast();
  const earnings = useQuery({ queryKey, queryFn: load });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ accountHolderName: "", ifsc: "", accountNumber: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  if (earnings.isPending) return <Spinner />;
  if (!earnings.data) return <p className="text-sm text-red-700">{errorMessage(earnings.error)}</p>;
  const e = earnings.data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl border border-border bg-white">
          <p className="text-[11px] font-bold uppercase text-text-secondary">Today</p>
          <p className="text-2xl font-black">{formatRupees(e.todayPaise)}</p>
          <p className="text-xs text-text-secondary">{e.todayOrders} orders</p>
        </div>
        <div className="p-4 rounded-2xl border border-border bg-white">
          <p className="text-[11px] font-bold uppercase text-text-secondary">Next payout (Monday)</p>
          <p className="text-2xl font-black">{formatRupees(e.unsettledPaise)}</p>
          <p className="text-xs text-text-secondary">{e.unsettledOrders} orders · minimum ₹100</p>
        </div>
      </div>

      <section className="p-4 rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Bank account
          </h3>
          <button onClick={() => setEditing(!editing)} className="text-xs font-bold text-brand">
            {e.account ? "Change" : "Add"}
          </button>
        </div>
        {e.account && !editing && (
          <p className="text-sm mt-2">
            {e.account.accountHolderName} · {e.account.ifsc} · ••••{e.account.accountLast4}
          </p>
        )}
        {!e.account && !editing && <p className="text-xs text-amber-800 mt-2">Add a bank account to receive automatic weekly payouts.</p>}
        {editing && (
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (form.accountNumber !== form.confirm) {
                toast("Account numbers do not match", "error");
                return;
              }
              setBusy(true);
              try {
                await saveAccount({ accountHolderName: form.accountHolderName, ifsc: form.ifsc.toUpperCase(), accountNumber: form.accountNumber });
                toast("Bank account saved", "success");
                setEditing(false);
                setForm({ accountHolderName: "", ifsc: "", accountNumber: "", confirm: "" });
                earnings.refetch();
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setBusy(false);
              }
            }}
            className="grid sm:grid-cols-2 gap-2 mt-3"
          >
            <input required placeholder="Account holder name" value={form.accountHolderName} onChange={(x) => setForm({ ...form, accountHolderName: x.target.value })} className="p-2.5 rounded-xl border border-border text-sm" />
            <input required placeholder="IFSC" value={form.ifsc} onChange={(x) => setForm({ ...form, ifsc: x.target.value })} className="p-2.5 rounded-xl border border-border text-sm uppercase" />
            <input required inputMode="numeric" autoComplete="off" placeholder="Account number" value={form.accountNumber} onChange={(x) => setForm({ ...form, accountNumber: x.target.value.replace(/\D/g, "") })} className="p-2.5 rounded-xl border border-border text-sm" />
            <input required inputMode="numeric" autoComplete="off" placeholder="Re-enter account number" value={form.confirm} onChange={(x) => setForm({ ...form, confirm: x.target.value.replace(/\D/g, "") })} className="p-2.5 rounded-xl border border-border text-sm" />
            <button disabled={busy} className="sm:col-span-2 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
              Save securely
            </button>
          </form>
        )}
      </section>

      <section>
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Payouts
        </h3>
        {e.payouts.length === 0 ? (
          <p className="text-xs text-text-secondary">No payouts yet. Earnings are settled every Monday for deliveries up to Sunday.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
            {e.payouts.map((p) => (
              <li key={p.id} className="p-3 flex items-center justify-between text-sm">
                <span>
                  <b>{formatRupees(p.amountPaise)}</b> · {p.orderCount} orders
                  <span className="block text-[11px] text-text-secondary">
                    {formatDateTime(p.createdAt)}
                    {p.utr && ` · UTR ${p.utr}`}
                  </span>
                </span>
                <span className={`text-xs font-bold ${p.status === "PAID" ? "text-success" : p.status === "FAILED" ? "text-red-700" : "text-text-secondary"}`}>{STATUS[p.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

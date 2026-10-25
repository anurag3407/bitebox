"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import type { Earnings } from "@startup/api-client";
import { Field } from "@/components/ui/field";
import { PageSpinner, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Scheduled", badge: "badge-neutral" },
  MANUAL: { label: "Bank transfer pending", badge: "badge-warn" },
  PROCESSING: { label: "In transit", badge: "badge-neutral" },
  PAID: { label: "Paid", badge: "badge-success" },
  FAILED: { label: "Failed · support notified", badge: "badge-danger" },
};

const EMPTY_FORM = { accountHolderName: "", ifsc: "", accountNumber: "", confirm: "" };

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
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  if (earnings.isPending) return <PageSpinner />;
  if (!earnings.data) return <p className="notice notice-danger">{errorMessage(earnings.error)}</p>;
  const e = earnings.data;
  const mismatch = form.confirm.length > 0 && form.accountNumber !== form.confirm;

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Today" value={formatRupees(e.todayPaise)} sub={`${e.todayOrders} orders`} />
        <Stat label="Next payout · Monday" value={formatRupees(e.unsettledPaise)} sub={`${e.unsettledOrders} orders · ₹100 minimum`} />
      </div>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Landmark className="h-4 w-4" /> Bank account
          </h3>
          <button
            onClick={() => {
              setEditing(!editing);
              setForm(EMPTY_FORM);
            }}
            className="btn btn-ghost btn-sm -mr-4"
          >
            {editing ? "Cancel" : e.account ? "Change" : "Add"}
          </button>
        </div>
        {e.account && !editing && (
          <p className="mt-3 text-[15px] text-ink">
            {e.account.accountHolderName} <span className="text-ink-muted">· {e.account.ifsc} · ••••{e.account.accountLast4}</span>
          </p>
        )}
        {!e.account && !editing && <p className="notice notice-warn mt-4">Add a bank account to receive automatic weekly payouts.</p>}
        {editing && (
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (form.accountNumber !== form.confirm) {
                toast("Account numbers don't match", "error");
                return;
              }
              setBusy(true);
              try {
                await saveAccount({ accountHolderName: form.accountHolderName, ifsc: form.ifsc.toUpperCase(), accountNumber: form.accountNumber });
                toast("Bank account saved", "success");
                setEditing(false);
                setForm(EMPTY_FORM);
                earnings.refetch();
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setBusy(false);
              }
            }}
            className="mt-6 grid gap-5 sm:grid-cols-2"
          >
            <Field label="Account holder name">
              <input required value={form.accountHolderName} onChange={(x) => setForm({ ...form, accountHolderName: x.target.value })} className="input" />
            </Field>
            <Field label="IFSC">
              <input required value={form.ifsc} onChange={(x) => setForm({ ...form, ifsc: x.target.value })} className="input uppercase" />
            </Field>
            <Field label="Account number">
              <input required inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={(x) => setForm({ ...form, accountNumber: x.target.value.replace(/\D/g, "") })} className="input" />
            </Field>
            <Field label="Re-enter account number" hint={mismatch ? "Doesn't match yet" : undefined}>
              <input required inputMode="numeric" autoComplete="off" value={form.confirm} onChange={(x) => setForm({ ...form, confirm: x.target.value.replace(/\D/g, "") })} className="input" />
            </Field>
            <div className="sm:col-span-2">
              <button disabled={busy || mismatch} className="btn btn-primary">
                {busy && <Spinner />} Save account
              </button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h3 className="text-base font-semibold text-ink">Payouts</h3>
        {e.payouts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No payouts yet. Earnings are settled every Monday for deliveries up to Sunday.</p>
        ) : (
          <ul className="rows mt-3">
            {e.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="text-[15px] text-ink tabular">
                    {formatRupees(p.amountPaise)} <span className="text-ink-muted">· {p.orderCount} orders</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatDateTime(p.createdAt)}
                    {p.utr && ` · UTR ${p.utr}`}
                  </p>
                </div>
                <span className={`badge ${STATUS[p.status]?.badge ?? "badge-neutral"}`}>{STATUS[p.status]?.label ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

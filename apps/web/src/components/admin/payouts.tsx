"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Payout } from "@startup/api-client";
import { ActionDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const FILTERS = [
  ["MANUAL", "Manual"],
  ["PENDING", "Pending"],
  ["PROCESSING", "Processing"],
  ["FAILED", "Failed"],
  ["PAID", "Paid"],
  ["", "All"],
] as const;

export function PayoutsTab() {
  const api = useApi();
  const toast = useToast();
  const [status, setStatus] = useState<Payout["status"] | "">("MANUAL");
  const [recording, setRecording] = useState<Payout | null>(null);
  const [settling, setSettling] = useState(false);
  const payouts = useQuery({ queryKey: ["admin-payouts", status], queryFn: () => api.getAdminPayouts(status || undefined) });
  const total = (payouts.data ?? []).reduce((s, p) => s + p.amountPaise, 0);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok, "success");
      payouts.refetch();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {FILTERS.map(([s, label]) => (
            <button key={s || "all"} aria-pressed={status === s} onClick={() => setStatus(s)} className="chip">
              {label}
            </button>
          ))}
        </div>
        <button
          disabled={settling}
          onClick={async () => {
            setSettling(true);
            await act(() => api.runSettlement(), "Settlement run complete");
            setSettling(false);
          }}
          className="btn btn-primary btn-sm"
        >
          Settle now
        </button>
      </div>
      <p className="text-sm text-ink-muted">
        <span className="text-ink tabular">
          {payouts.data?.length ?? 0} payouts · {formatRupees(total)}
        </span>
        . Settlement runs automatically every Monday for deliveries up to Sunday midnight IST.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th className="py-3 pr-4 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="py-3 pl-4 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {payouts.data?.map((p) => (
              <tr key={p.id}>
                <td className="py-4 pr-4">
                  <p className="font-medium text-ink">{p.ownerName}</p>
                  <p className="text-xs capitalize text-ink-muted">
                    {p.ownerType.toLowerCase()} · {formatDateTime(p.createdAt)}
                  </p>
                </td>
                <td className="px-4 py-4 text-ink-soft tabular">{p.orderCount}</td>
                <td className="px-4 py-4 text-right font-medium text-ink tabular">{formatRupees(p.amountPaise)}</td>
                <td className="px-4 py-4 text-xs">
                  <span className="capitalize text-ink">{p.status.toLowerCase()}</span>
                  {p.utr && <span className="block text-ink-muted">UTR {p.utr}</span>}
                  {p.failureReason && <span className="block text-danger">{p.failureReason}</span>}
                </td>
                <td className="py-4 pl-4 text-right">
                  {p.status === "MANUAL" && (
                    <button onClick={() => setRecording(p)} className="btn btn-outline btn-sm">
                      Record transfer
                    </button>
                  )}
                  {p.status === "FAILED" && (
                    <button onClick={() => act(() => api.switchPayoutToManual(p.id), "Moved to manual transfer")} className="btn btn-outline btn-sm">
                      Pay manually
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {payouts.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-16 text-center text-ink-muted">
                  No payouts
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ActionDialog
        open={!!recording}
        onClose={() => setRecording(null)}
        title="Record bank transfer"
        description={recording ? `${formatRupees(recording.amountPaise)} to ${recording.ownerName}` : undefined}
        confirmLabel="Mark paid"
        input={{ label: "UTR or bank reference", placeholder: "e.g. HDFC0000123456" }}
        onConfirm={(utr) => act(() => api.markPayoutPaid(recording!.id, utr), "Marked paid")}
      />
    </div>
  );
}

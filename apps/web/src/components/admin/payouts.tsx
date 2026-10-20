"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Payout } from "@startup/api-client";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

export function PayoutsTab() {
  const api = useApi();
  const toast = useToast();
  const [status, setStatus] = useState<Payout["status"] | "">("MANUAL");
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2 flex-wrap">
          {(["MANUAL", "PENDING", "PROCESSING", "FAILED", "PAID", ""] as const).map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${status === s ? "bg-text-primary text-white" : "border-border"}`}>
              {s ? s.toLowerCase() : "all"}
            </button>
          ))}
        </div>
        <button onClick={() => act(() => api.runSettlement(), "Settlement run complete")} className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold">
          Settle now
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        {payouts.data?.length ?? 0} payouts · {formatRupees(total)}. Weekly settlement runs automatically on Monday for deliveries up to Sunday midnight (IST).
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs text-text-secondary text-left">
            <tr>
              <th className="p-3">Partner</th>
              <th className="p-3">Orders</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payouts.data?.map((p) => (
              <tr key={p.id}>
                <td className="p-3">
                  <p className="font-semibold">{p.ownerName}</p>
                  <p className="text-xs text-text-secondary">
                    {p.ownerType.toLowerCase()} · {formatDateTime(p.createdAt)}
                  </p>
                </td>
                <td className="p-3">{p.orderCount}</td>
                <td className="p-3 text-right font-bold">{formatRupees(p.amountPaise)}</td>
                <td className="p-3 text-xs">
                  {p.status}
                  {p.utr && <span className="block text-text-secondary">UTR {p.utr}</span>}
                  {p.failureReason && <span className="block text-red-700">{p.failureReason}</span>}
                </td>
                <td className="p-3">
                  {p.status === "MANUAL" && (
                    <button
                      onClick={() => {
                        const utr = prompt("Bank transfer UTR / reference")?.trim();
                        if (utr) act(() => api.markPayoutPaid(p.id, utr), "Marked paid");
                      }}
                      className="text-xs font-bold text-success"
                    >
                      Record transfer
                    </button>
                  )}
                  {p.status === "FAILED" && (
                    <button onClick={() => act(() => api.switchPayoutToManual(p.id), "Moved to manual transfer")} className="text-xs font-bold text-brand">
                      Pay manually
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

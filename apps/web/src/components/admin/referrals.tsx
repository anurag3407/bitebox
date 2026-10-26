"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

export function ReferralsTab() {
  const api = useApi();
  const referrals = useQuery({ queryKey: ["admin-referrals"], queryFn: () => api.getAdminReferrals() });

  const rewarded = referrals.data?.filter((r) => r.status === "REWARDED") ?? [];
  const pending = referrals.data?.filter((r) => r.status === "PENDING") ?? [];
  const paidOut = rewarded.reduce((sum, r) => sum + r.referrerRewardPaise + r.refereeRewardPaise, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl bg-subtle p-5">
          <p className="text-[13px] text-ink-muted">Invites</p>
          <p className="mt-2 text-2xl font-semibold text-ink tabular">{referrals.data?.length ?? 0}</p>
        </div>
        <div className="rounded-3xl bg-subtle p-5">
          <p className="text-[13px] text-ink-muted">Pending first order</p>
          <p className="mt-2 text-2xl font-semibold text-ink tabular">{pending.length}</p>
        </div>
        <div className="rounded-3xl bg-success-soft p-5">
          <p className="text-[13px] text-ink-muted">Credits issued</p>
          <p className="mt-2 text-2xl font-semibold text-success tabular">{formatRupees(paidOut)}</p>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th className="py-3 pr-4 font-medium">Referrer</th>
              <th className="px-4 py-3 font-medium">Friend</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Reward</th>
              <th className="py-3 pl-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {referrals.data?.map((r) => (
              <tr key={r.id} className="hover:bg-subtle">
                <td className="py-4 pr-4 font-medium text-ink">{r.referrerName}</td>
                <td className="px-4 py-4 text-ink-soft">{r.refereeName}</td>
                <td className="px-4 py-4 font-mono text-xs text-ink-muted">{r.code}</td>
                <td className="px-4 py-4">
                  <span className={`badge ${r.status === "REWARDED" ? "badge-success" : r.status === "PENDING" ? "badge-warn" : "badge-neutral"}`}>
                    {r.status.toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-ink tabular">
                  {r.status === "REWARDED" ? formatRupees(r.referrerRewardPaise + r.refereeRewardPaise) : "—"}
                </td>
                <td className="py-4 pl-4 text-ink-muted">{formatDateTime(r.createdAt)}</td>
              </tr>
            ))}
            {referrals.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-ink-muted">
                  No referrals yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {referrals.isPending && <div className="skeleton mt-4 h-40" />}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-ink-muted">
        <Gift className="h-3.5 w-3.5" /> Rewards are credited only after the friend’s first order is delivered.
      </p>
    </div>
  );
}

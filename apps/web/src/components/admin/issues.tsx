"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import type { OrderIssueDto } from "@startup/api-client";
import { Modal } from "@/components/ui/modal";
import { Field, MoneyInput } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const RESOLUTIONS = [
  ["WALLET_CREDIT", "Instant credits"],
  ["PARTIAL_REFUND", "Partial refund"],
  ["FULL_REFUND", "Full refund"],
  ["COUPON", "Coupon"],
  ["NONE", "Reject claim"],
] as const;

export function IssuesTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OrderIssueDto["status"] | "">("UNDER_REVIEW");
  const [selected, setSelected] = useState<OrderIssueDto | null>(null);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number][0]>("WALLET_CREDIT");
  const [amountPaise, setAmountPaise] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const queue = useQuery({
    queryKey: ["admin-issues", status],
    queryFn: () => api.getAdminIssues(status || undefined),
    refetchInterval: 20_000,
  });

  const open = (issue: OrderIssueDto) => {
    setSelected(issue);
    setResolution(issue.walletCreditPaise > 0 ? "WALLET_CREDIT" : "WALLET_CREDIT");
    setAmountPaise(issue.walletCreditPaise || 0);
    setCouponCode(issue.couponCode ?? "");
    setNote("");
  };

  const submit = async () => {
    if (!selected) return;
    if (note.trim().length < 3) {
      toast("Add a resolution note", "error");
      return;
    }
    setBusy(true);
    try {
      await api.resolveOrderIssue(selected.id, {
        resolution,
        note: note.trim(),
        walletCreditPaise: resolution === "WALLET_CREDIT" ? amountPaise : undefined,
        refundAmountPaise: resolution === "PARTIAL_REFUND" || resolution === "COUPON" ? amountPaise : undefined,
        couponCode: resolution === "COUPON" ? couponCode : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-issues"] });
      toast("Problem report resolved", "success");
      setSelected(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatus("")} aria-pressed={status === ""} className="chip h-9">
          All
        </button>
        {(["UNDER_REVIEW", "OPEN", "RESOLVED", "REJECTED"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className="chip h-9">
            {s.toLowerCase().replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <ul className="rows">
          {queue.data?.map((issue) => (
            <li key={issue.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-ink">
                  {issue.category.toLowerCase().replace(/_/g, " ")}
                  <span className={`badge ${issue.status === "RESOLVED" ? "badge-success" : issue.status === "REJECTED" ? "badge-neutral" : "badge-warn"}`}>
                    {issue.status.toLowerCase().replace("_", " ")}
                  </span>
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-ink-muted">
                  #{issue.orderNumber} · {issue.customerName} · {formatDateTime(issue.createdAt)}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-ink-soft">{issue.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {issue.photosJson.length > 0 && <span className="text-xs text-ink-muted">{issue.photosJson.length} photo(s)</span>}
                {issue.resolution && <span className="text-xs text-ink-muted">{issue.resolution.toLowerCase().replace("_", " ")}</span>}
                <button onClick={() => open(issue)} className="btn btn-outline btn-sm">
                  {issue.status === "UNDER_REVIEW" || issue.status === "OPEN" ? "Resolve" : "View"}
                </button>
              </div>
            </li>
          ))}
          {queue.data?.length === 0 && <li className="py-16 text-center text-sm text-ink-muted">Nothing in this queue</li>}
        </ul>
        {queue.isPending && <div className="skeleton mt-4 h-40" />}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? `${selected.category.toLowerCase().replace(/_/g, " ")} · #${selected.orderNumber}` : "Problem report"}
        description={selected ? `${selected.customerName} · ${formatDateTime(selected.createdAt)}` : undefined}
        footer={
          selected && (selected.status === "OPEN" || selected.status === "UNDER_REVIEW") ? (
            <button disabled={busy} onClick={submit} className="btn btn-primary btn-block">
              {busy && <Spinner />} Apply resolution
            </button>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-6">
            {selected.status === "RESOLVED" && (
              <p className="notice notice-success">
                <Check className="mt-0.5 h-4 w-4 shrink-0" /> {selected.adminNote ?? "Resolved"}
                {selected.walletCreditPaise > 0 ? ` · ${formatRupees(selected.walletCreditPaise)} credits` : ""}
              </p>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Customer says</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{selected.description}</p>
            </div>
            {selected.photosJson.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.photosJson.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Evidence ${i + 1}`} className="h-24 w-24 rounded-xl object-cover" />
                  </a>
                ))}
              </div>
            )}
            {(selected.status === "OPEN" || selected.status === "UNDER_REVIEW") && (
              <>
                <div>
                  <p className="label">Resolution</p>
                  <div className="flex flex-wrap gap-2">
                    {RESOLUTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => {
                          setResolution(value);
                          if (value === "COUPON" && amountPaise === 0) setAmountPaise(10_000);
                        }}
                        aria-pressed={resolution === value}
                        className="chip h-9"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {(resolution === "WALLET_CREDIT" || resolution === "PARTIAL_REFUND" || resolution === "COUPON") && (
                  <Field
                    label={resolution === "WALLET_CREDIT" ? "Credits to grant" : resolution === "COUPON" ? "Coupon value" : "Refund amount"}
                    hint={
                      resolution === "PARTIAL_REFUND"
                        ? "Gateway orders refund to source; wallet/COD orders become credits."
                        : resolution === "COUPON"
                          ? "Creates a single-use flat coupon valid for 90 days."
                          : undefined
                    }
                  >
                    <MoneyInput paise={amountPaise} onChange={setAmountPaise} ariaLabel="Amount" />
                  </Field>
                )}
                {resolution === "COUPON" && (
                  <Field label="Coupon code" hint="Share this code with the customer in the resolution note.">
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="input uppercase"
                      placeholder="SORRY100"
                    />
                  </Field>
                )}
                <Field label="Resolution note" hint="Sent to the customer in Support.">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="input" />
                </Field>
                {selected.category === "NOT_DELIVERED" && (
                  <p className="notice notice-warn">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Check the delivery proof and rider call log before refunding a
                    non-delivery.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

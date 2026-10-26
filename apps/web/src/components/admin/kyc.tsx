"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileText, ShieldCheck } from "lucide-react";
import type { AdminRiderVerificationRow } from "@startup/api-client";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const FILTERS = ["IN_REVIEW", "PENDING", "REJECTED", "VERIFIED", "SUSPENDED"] as const;

function statusBadge(status: string) {
  return status === "VERIFIED"
    ? "badge-success"
    : status === "IN_REVIEW"
      ? "badge-warn"
      : status === "REJECTED" || status === "SUSPENDED"
        ? "badge-danger"
        : "badge-neutral";
}

export function KycTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof FILTERS)[number] | "">("IN_REVIEW");
  const [selected, setSelected] = useState<AdminRiderVerificationRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const queue = useQuery({
    queryKey: ["admin-kyc", status],
    queryFn: () => api.getAdminRiderVerifications(status || undefined),
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ["admin-kyc-detail", selected?.riderId],
    queryFn: () => api.getAdminRiderVerification(selected!.riderId),
    enabled: !!selected,
  });

  const act = async (decision: "APPROVE" | "REJECT" | "SUSPEND") => {
    if (!selected) return;
    if (decision !== "APPROVE" && note.trim().length < 3) {
      toast("Add a reason for the rider", "error");
      return;
    }
    setBusy(decision);
    try {
      await api.reviewRiderVerification(selected.riderId, decision, note.trim() || "Documents verified");
      await queryClient.invalidateQueries({ queryKey: ["admin-kyc"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-kyc-detail"] });
      toast(decision === "APPROVE" ? "Rider verified" : decision === "SUSPEND" ? "Rider suspended" : "Verification rejected", "success");
      setSelected(null);
      setNote("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatus("")} aria-pressed={status === ""} className="chip h-9">
          All
        </button>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setStatus(f)} aria-pressed={status === f} className="chip h-9">
            {f.toLowerCase().replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th className="py-3 pr-4 font-medium">Partner</th>
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium">Documents</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="py-3 pl-4 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {queue.data?.map((row) => (
              <tr key={row.riderId} className="hover:bg-subtle">
                <td className="py-4 pr-4">
                  <p className="font-medium text-ink">{row.name}</p>
                  <p className="text-xs text-ink-muted">{row.phone}</p>
                </td>
                <td className="px-4 py-4 capitalize text-ink-soft">
                  {row.vehicleType.toLowerCase()}
                  {row.isApproved ? "" : " · blocked"}
                </td>
                <td className="px-4 py-4 text-ink-soft tabular">{row.documentCount}</td>
                <td className="px-4 py-4 text-ink-muted">{row.submittedAt ? formatDateTime(row.submittedAt) : "—"}</td>
                <td className="px-4 py-4">
                  <span className={`badge ${statusBadge(row.status)}`}>{row.status.toLowerCase().replace("_", " ")}</span>
                </td>
                <td className="py-4 pl-4 text-right">
                  <button onClick={() => setSelected(row)} className="text-sm font-medium text-ink underline underline-offset-4">
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {queue.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-ink-muted">
                  No riders in this state
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {queue.isPending && <div className="skeleton mt-4 h-40" />}
      </div>

      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setNote("");
        }}
        size="lg"
        title={selected ? `${selected.name} · KYC review` : "KYC review"}
        description={selected ? `${selected.phone} · ${selected.vehicleType.toLowerCase()}` : undefined}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button disabled={!!busy} onClick={() => act("REJECT")} className="btn btn-danger-ghost flex-1">
              {busy === "REJECT" && <Spinner />} Reject
            </button>
            <button disabled={!!busy} onClick={() => act("SUSPEND")} className="btn btn-outline flex-1">
              {busy === "SUSPEND" && <Spinner />} Suspend
            </button>
            <button disabled={!!busy} onClick={() => act("APPROVE")} className="btn btn-success flex-[1.4]">
              {busy === "APPROVE" && <Spinner />} <BadgeCheck className="h-4 w-4" /> Approve rider
            </button>
          </div>
        }
      >
        {detail.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : detail.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-subtle p-4">
                <p className="text-xs text-ink-muted">Status</p>
                <p className="mt-1 text-sm font-medium capitalize text-ink">{detail.data.status.toLowerCase().replace("_", " ")}</p>
              </div>
              <div className="rounded-2xl bg-subtle p-4">
                <p className="text-xs text-ink-muted">Background check</p>
                <p className="mt-1 text-sm font-medium capitalize text-ink">{detail.data.backgroundCheckStatus.toLowerCase()}</p>
              </div>
              <div className="rounded-2xl bg-subtle p-4">
                <p className="text-xs text-ink-muted">Aadhaar</p>
                <p className="mt-1 text-sm font-medium text-ink tabular">•••• {detail.data.aadhaarLast4 ?? "—"}</p>
              </div>
            </div>

            <div>
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <FileText className="h-4 w-4" /> Documents
              </p>
              <div className="grid grid-cols-2 gap-3">
                {detail.data.requiredDocs.map((docType) => {
                  const doc = detail.data!.documents.find((d) => d.docType === docType);
                  return (
                    <div key={docType} className="overflow-hidden rounded-2xl border border-line">
                      {doc?.fileUrl ? (
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={doc.fileUrl} alt={docType} className="h-32 w-full object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-subtle text-xs text-ink-muted">Not uploaded</div>
                      )}
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <span className="text-xs font-medium text-ink">{docType.toLowerCase().replace(/_/g, " ")}</span>
                        <span className={`text-[10px] font-medium ${doc?.status === "VERIFIED" ? "text-success" : doc?.status === "REJECTED" ? "text-danger" : "text-warn"}`}>
                          {doc?.status.toLowerCase() ?? "missing"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">Review note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                className="input"
                placeholder="Required when rejecting or suspending"
              />
            </div>
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Approving enables the rider to go online and receive orders.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{errorMessage(detail.error)}</p>
        )}
      </Modal>
    </div>
  );
}

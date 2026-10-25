"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { EmptyState, PageSpinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees, timeAgo } from "@/lib/format";

const STATUSES = [
  ["SUBMITTED", "To review"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
] as const;

function humanise(key: string): string {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ApplicationsTab() {
  const api = useApi();
  const toast = useToast();
  const [status, setStatus] = useState<"SUBMITTED" | "APPROVED" | "REJECTED">("SUBMITTED");
  const apps = useQuery({ queryKey: ["admin-applications", status], queryFn: () => api.getApplications(status) });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex gap-2">
        {STATUSES.map(([s, label]) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className="chip">
            {label}
          </button>
        ))}
      </div>
      {apps.isPending && <PageSpinner />}
      {apps.data?.length === 0 && <EmptyState title="Nothing here" body={status === "SUBMITTED" ? "No applications are waiting for review." : undefined} />}
      {apps.data?.map((a) => (
        <article key={a.id} className="card space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-ink">{a.type === "MERCHANT" ? a.details.restaurantName : a.details.fullName}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {a.type === "MERCHANT" ? "Restaurant" : "Delivery partner"} · {a.applicantName} · {a.applicantEmail}
              </p>
            </div>
            <span className="shrink-0 text-xs text-ink-muted">{timeAgo(a.createdAt)}</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {Object.entries(a.details)
              .filter(([k]) => k !== "location")
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-ink-muted">{humanise(k)}</dt>
                  <dd className="mt-0.5 break-all text-ink">{Array.isArray(v) ? v.join(", ") : typeof v === "number" && k.endsWith("Paise") ? formatRupees(v) : String(v)}</dd>
                </div>
              ))}
          </dl>
          {a.type === "MERCHANT" && a.details.location && (
            <a
              className="btn btn-outline btn-sm"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps?q=${a.details.location.latitude},${a.details.location.longitude}`}
            >
              <MapPin className="h-3.5 w-3.5" /> View pinned location
            </a>
          )}
          {a.status === "SUBMITTED" ? (
            <div className="flex flex-wrap gap-2 border-t border-line pt-6">
              <input
                placeholder="Note, e.g. FSSAI verified on portal"
                aria-label="Review note"
                value={notes[a.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                className="input h-11 min-w-[220px] flex-1"
              />
              {(["REJECT", "APPROVE"] as const).map((d) => (
                <button
                  key={d}
                  disabled={busyId === a.id}
                  onClick={async () => {
                    setBusyId(a.id);
                    try {
                      await api.reviewApplication(a.id, d, notes[a.id]);
                      toast(d === "APPROVE" ? "Partner approved and provisioned" : "Application rejected", "success");
                      apps.refetch();
                    } catch (err) {
                      toast(errorMessage(err), "error");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className={`btn ${d === "APPROVE" ? "btn-success" : "btn-danger-ghost"}`}
                >
                  {d === "APPROVE" ? "Approve" : "Reject"}
                </button>
              ))}
            </div>
          ) : (
            a.reviewNote && <p className="notice notice-neutral">Note: {a.reviewNote}</p>
          )}
        </article>
      ))}
    </div>
  );
}

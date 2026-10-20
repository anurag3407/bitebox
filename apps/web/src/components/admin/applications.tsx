"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export function ApplicationsTab() {
  const api = useApi();
  const toast = useToast();
  const [status, setStatus] = useState<"SUBMITTED" | "APPROVED" | "REJECTED">("SUBMITTED");
  const apps = useQuery({ queryKey: ["admin-applications", status], queryFn: () => api.getApplications(status) });
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["SUBMITTED", "APPROVED", "REJECTED"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${status === s ? "bg-text-primary text-white" : "border-border"}`}>
            {s === "SUBMITTED" ? "To review" : s.toLowerCase()}
          </button>
        ))}
      </div>
      {apps.isPending && <Spinner />}
      {apps.data?.length === 0 && <p className="text-sm text-text-secondary">Nothing here.</p>}
      {apps.data?.map((a) => (
        <article key={a.id} className="p-4 rounded-2xl border border-border bg-white space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <p className="font-bold">
              {a.type === "MERCHANT" ? `Restaurant: ${a.details.restaurantName}` : `Rider: ${a.details.fullName}`}
            </p>
            <span className="text-xs text-text-secondary">{timeAgo(a.createdAt)}</span>
          </div>
          <p className="text-xs text-text-secondary">
            Applicant {a.applicantName} · {a.applicantEmail}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {Object.entries(a.details)
              .filter(([k]) => !["location"].includes(k))
              .map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-text-secondary">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                  <dd className="font-medium break-all">{Array.isArray(v) ? v.join(", ") : typeof v === "number" && k.endsWith("Paise") ? `₹${v / 100}` : String(v)}</dd>
                </React.Fragment>
              ))}
          </dl>
          {a.type === "MERCHANT" && a.details.location && (
            <a className="text-xs text-brand underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.details.location.latitude},${a.details.location.longitude}`}>
              View pinned location
            </a>
          )}
          {a.status === "SUBMITTED" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <input
                placeholder="Note (e.g. FSSAI verified on portal)"
                value={notes[a.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                className="flex-1 min-w-[200px] p-2 rounded-xl border border-border text-xs"
              />
              {(["REJECT", "APPROVE"] as const).map((d) => (
                <button
                  key={d}
                  onClick={async () => {
                    try {
                      await api.reviewApplication(a.id, d, notes[a.id]);
                      toast(d === "APPROVE" ? "Partner approved and provisioned" : "Application rejected", "success");
                      apps.refetch();
                    } catch (err) {
                      toast(errorMessage(err), "error");
                    }
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold ${d === "APPROVE" ? "bg-success text-white" : "border border-red-200 text-red-700"}`}
                >
                  {d === "APPROVE" ? "Approve" : "Reject"}
                </button>
              ))}
            </div>
          ) : (
            a.reviewNote && <p className="text-xs">Note: {a.reviewNote}</p>
          )}
        </article>
      ))}
    </div>
  );
}

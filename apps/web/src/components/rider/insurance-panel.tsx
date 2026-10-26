"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Backpack, HeartPulse, ShieldCheck } from "lucide-react";
import { Field, MoneyInput } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const INCIDENT_LABELS: Record<string, string> = {
  ACCIDENT: "Road accident",
  HOSPITALIZATION: "Hospitalization",
  VEHICLE_DAMAGE: "Vehicle damage",
  OTHER: "Other incident",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "badge-warn",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RiderInsurancePanel() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insurance = useQuery({ queryKey: ["rider-insurance"], queryFn: () => api.getRiderInsurance() });
  const equipment = useQuery({ queryKey: ["rider-equipment"], queryFn: () => api.getRiderEquipment() });
  const [activating, setActivating] = useState(false);
  const [filing, setFiling] = useState(false);
  const [incidentType, setIncidentType] = useState("ACCIDENT");
  const [incidentDate, setIncidentDate] = useState(isoToday());
  const [claimedPaise, setClaimedPaise] = useState(50000);
  const [description, setDescription] = useState("");

  if (insurance.isPending) return <div className="skeleton h-48" />;
  if (!insurance.data) return <p className="notice notice-danger">{errorMessage(insurance.error)}</p>;
  const { policy, claims } = insurance.data;

  const activate = async () => {
    setActivating(true);
    try {
      await api.enrollRiderInsurance();
      await queryClient.invalidateQueries({ queryKey: ["rider-insurance"] });
      toast("Partner accident cover activated", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setActivating(false);
    }
  };

  const file = async () => {
    setFiling(true);
    try {
      await api.fileInsuranceClaim({
        incidentType: incidentType as "ACCIDENT" | "HOSPITALIZATION" | "VEHICLE_DAMAGE" | "OTHER",
        incidentDate,
        description: description.trim(),
        claimedPaise,
      });
      await queryClient.invalidateQueries({ queryKey: ["rider-insurance"] });
      toast("Claim submitted for review", "success");
      setDescription("");
      setClaimedPaise(50000);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setFiling(false);
    }
  };

  if (!policy || policy.status !== "ACTIVE" || new Date(policy.validUntil).getTime() <= Date.now()) {
    return (
      <section className="rounded-3xl border border-line bg-white p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <HeartPulse className="h-4 w-4" /> Partner accident cover
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Verified partners get platform-paid accident cover: ₹5,00,000 for accidental injury and
          ₹50,000 hospital cash. Activate it before you need it.
        </p>
        <button className="btn btn-primary mt-4" disabled={activating} onClick={activate}>
          {activating ? <Spinner /> : <ShieldCheck className="h-4 w-4" />}
          {activating ? "Activating…" : "Activate cover"}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl bg-ink p-6 text-white">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-white/55">
          <ShieldCheck className="h-3.5 w-3.5" /> {policy.planName}
        </p>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular">{formatRupees(policy.coveragePaise)}</p>
        <p className="mt-1 text-sm text-white/60">
          Accidental cover · {formatRupees(policy.hospitalCashPaise)} hospital cash · valid until{" "}
          {new Date(policy.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <p className="mt-4 border-t border-white/10 pt-4 text-xs text-white/50">
          Platform-paid. Claims are reviewed by the operations team and paid with your next payout.
        </p>
      </div>

      <div className="rounded-3xl border border-line bg-white p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <HeartPulse className="h-4 w-4" /> Report an incident
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Type</span>
            <select className="input" value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
              {Object.entries(INCIDENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Incident date</span>
            <input className="input" type="date" value={incidentDate} max={isoToday()} onChange={(e) => setIncidentDate(e.target.value)} />
          </label>
          <Field label="Claim amount">
            <MoneyInput paise={claimedPaise} onChange={setClaimedPaise} ariaLabel="Claim amount" />
          </Field>
          <label className="sm:col-span-2">
            <span className="label">What happened?</span>
            <textarea className="input" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the incident, injuries and any treatment received." />
          </label>
        </div>
        <button
          className="btn btn-primary mt-4"
          disabled={filing || claimedPaise < 10000 || description.trim().length < 20}
          onClick={file}
        >
          {filing && <Spinner />} Submit claim
        </button>
      </div>

      <div className="rounded-3xl border border-line bg-white p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Backpack className="h-4 w-4" /> Your kit & equipment
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Mandatory safety kit and gear. Helmets and bags are scheduled for renewal every 180 days.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ["HELMET", "Helmet"],
            ["DELIVERY_BAG", "Delivery bag"],
            ["T_SHIRT", "T-shirt"],
            ["INSURANCE_CARD", "Insurance card"],
          ] as const).map(([type, label]) => {
            const item = equipment.data?.equipment.find((e) => e.itemType === type && e.status === "ISSUED");
            const lostItem = equipment.data?.equipment.find((e) => e.itemType === type && e.status === "LOST");
            return (
              <div key={type} className="flex flex-col justify-between gap-2 rounded-2xl border border-line bg-subtle p-3.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-ink">{label}</span>
                    {item && item.renewalDueAt && (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Renewal due: {new Date(item.renewalDueAt).toLocaleDateString("en-IN")}
                      </p>
                    )}
                    {lostItem?.replacementFeeDeducted && (
                      <p className="mt-0.5 text-xs text-danger font-medium">
                        Lost fee paid: {formatRupees(lostItem.replacementFeePaise ?? 0)}
                      </p>
                    )}
                  </div>
                  <span className={`badge ${
                    item
                      ? item.renewalStatus === "EXPIRED"
                        ? "badge-danger"
                        : item.renewalStatus === "DUE_SOON"
                          ? "badge-warn"
                          : "badge-success"
                      : "badge-neutral"
                  }`}>
                    {item ? (item.renewalStatus && item.renewalStatus !== "VALID" ? item.renewalStatus.toLowerCase().replace("_", " ") : "issued") : "not issued"}
                  </span>
                </div>
                {item && (item.renewalStatus === "DUE_SOON" || item.renewalStatus === "EXPIRED") && (
                  <button
                    onClick={async () => {
                      try {
                        await api.requestRiderEquipmentRenewal(type);
                        await queryClient.invalidateQueries({ queryKey: ["rider-equipment"] });
                        toast("Kit renewal scheduled with hub", "success");
                      } catch (err) {
                        toast(errorMessage(err), "error");
                      }
                    }}
                    className="btn btn-outline btn-xs mt-1 w-fit"
                  >
                    Request renewal
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {claims.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Your claims</h3>
          {claims.map((claim) => (
            <article key={claim.id} className="rounded-2xl border border-line bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{INCIDENT_LABELS[claim.incidentType] ?? claim.incidentType}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {new Date(`${claim.incidentDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    claimed {formatRupees(claim.claimedPaise)}
                  </p>
                </div>
                <span className={`badge ${STATUS_TONE[claim.status] ?? "badge-neutral"}`}>{claim.status.toLowerCase()}</span>
              </div>
              <p className="mt-2 text-ink-soft">{claim.description}</p>
              {claim.status === "APPROVED" && claim.approvedPaise && (
                <p className="mt-2 text-xs text-success">Approved {formatRupees(claim.approvedPaise)} · paid with your next payout</p>
              )}
              {claim.reviewNote && <p className="mt-2 text-xs text-ink-muted">Review note: {claim.reviewNote}</p>}
              {claim.reviewedAt && <p className="mt-1 text-xs text-ink-muted">Reviewed {formatDateTime(claim.reviewedAt)}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

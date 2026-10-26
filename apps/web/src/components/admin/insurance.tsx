"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import type { RiderInsuranceClaim } from "@startup/api-client";
import { MoneyInput } from "@/components/ui/field";
import { Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  ACCIDENT: "Road accident",
  HOSPITALIZATION: "Hospitalization",
  VEHICLE_DAMAGE: "Vehicle damage",
  OTHER: "Other incident",
};

const TONE: Record<string, string> = {
  PENDING: "badge-warn",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
};

function ClaimCard({ claim }: { claim: RiderInsuranceClaim }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [approvedPaise, setApprovedPaise] = useState(claim.claimedPaise);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);

  const review = async (status: "APPROVED" | "REJECTED") => {
    setBusy(status);
    try {
      await api.reviewInsuranceClaim(claim.id, {
        status,
        approvedPaise: status === "APPROVED" ? approvedPaise : undefined,
        note: note.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-insurance-claims"] });
      toast(status === "APPROVED" ? "Claim approved and added to the next payout" : "Claim rejected", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{TYPE_LABELS[claim.incidentType] ?? claim.incidentType}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {claim.riderName} · {claim.riderPhone} · incident{" "}
            {new Date(`${claim.incidentDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{claim.description}</p>
        </div>
        <span className={`badge ${TONE[claim.status] ?? "badge-neutral"}`}>{claim.status.toLowerCase()}</span>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        Claimed <b className="font-medium text-ink tabular">{formatRupees(claim.claimedPaise)}</b>
        {claim.approvedPaise ? <> · approved <b className="font-medium text-success tabular">{formatRupees(claim.approvedPaise)}</b></> : null}
      </p>
      {claim.reviewNote && <p className="mt-1 text-sm text-ink-muted">Note: {claim.reviewNote}</p>}
      {claim.status === "PENDING" && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <div className="w-44">
            <span className="label">Approved amount</span>
            <MoneyInput paise={approvedPaise} onChange={setApprovedPaise} ariaLabel="Approved amount" />
          </div>
          <label className="min-w-[220px] flex-1">
            <span className="label">Review note</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional for approval, required to reject" maxLength={1000} />
          </label>
          <button className="btn btn-secondary" disabled={busy !== null || !note.trim()} onClick={() => review("REJECTED")}>
            {busy === "REJECTED" && <Spinner />} Reject
          </button>
          <button className="btn btn-primary" disabled={busy !== null || approvedPaise < 1} onClick={() => review("APPROVED")}>
            {busy === "APPROVED" && <Spinner />} Approve
          </button>
        </div>
      )}
    </article>
  );
}

export function AdminInsuranceTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const claims = useQuery({ queryKey: ["admin-insurance-claims"], queryFn: () => api.getAdminInsuranceClaims(), refetchInterval: 20_000 });
  const riders = useQuery({ queryKey: ["admin-riders"], queryFn: () => api.getAdminRiders() });
  const [riderId, setRiderId] = useState("");
  const [itemType, setItemType] = useState<"HELMET" | "DELIVERY_BAG" | "T_SHIRT" | "INSURANCE_CARD">("HELMET");
  const [size, setSize] = useState("");
  const [issuing, setIssuing] = useState(false);
  const kit = useQuery({
    queryKey: ["admin-kit", riderId],
    queryFn: () => api.getRiderEquipmentForAdmin(riderId),
    enabled: !!riderId,
  });

  const markKit = async (
    itemType: "HELMET" | "DELIVERY_BAG" | "T_SHIRT" | "INSURANCE_CARD",
    status: "RETURNED" | "LOST" | "RENEWED",
    chargeRider?: boolean
  ) => {
    try {
      await api.updateRiderEquipmentStatus(riderId, itemType, status, chargeRider);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-kit", riderId] }),
        queryClient.invalidateQueries({ queryKey: ["rider-equipment"] }),
      ]);
      toast(
        status === "RENEWED"
          ? "Kit item renewed for 180 days"
          : chargeRider
            ? "Kit marked lost and replacement fee charged"
            : `Kit marked ${status.toLowerCase()}`,
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const issue = async () => {
    setIssuing(true);
    try {
      await api.issueRiderEquipment({ riderId, itemType, size: size.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: ["rider-equipment"] });
      toast("Kit item issued", "success");
      setSize("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setIssuing(false);
    }
  };

  if (claims.isPending) return <div className="skeleton h-64" />;
  if (!claims.data) return <p className="notice notice-danger">{errorMessage(claims.error)}</p>;
  const rows = claims.data.claims;
  const pending = rows.filter((c) => c.status === "PENDING");
  const approved = rows.filter((c) => c.status === "APPROVED");
  const paidOut = approved.reduce((sum, c) => sum + (c.approvedPaise ?? 0), 0);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="flex items-center gap-2 h-section">
          <HeartPulse className="h-5 w-5" /> Partner cover claims
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Review incident claims; approvals become rider payables in the next payout.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Pending" value={String(pending.length)} sub="Awaiting review" />
          <Stat label="Approved" value={String(approved.length)} sub="Settled via payouts" />
          <Stat label="Approved value" value={formatRupees(paidOut)} sub="Lifetime" />
        </div>
      </section>
      <section className="rounded-3xl border border-line bg-white p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <HeartPulse className="h-4 w-4" /> Issue rider kit
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Record helmets, bags, t-shirts and insurance cards against a partner.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1">
            <span className="label">Rider</span>
            <select className="input" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
              <option value="">Select a rider</option>
              {riders.data?.map((rider: any) => <option key={rider.id} value={rider.id}>{rider.name} · {rider.phone}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Item</span>
            <select className="input" value={itemType} onChange={(e) => setItemType(e.target.value as typeof itemType)}>
              <option value="HELMET">Helmet</option>
              <option value="DELIVERY_BAG">Delivery bag</option>
              <option value="T_SHIRT">T-shirt</option>
              <option value="INSURANCE_CARD">Insurance card</option>
            </select>
          </label>
          <label className="w-24">
            <span className="label">Size</span>
            <input className="input" value={size} onChange={(e) => setSize(e.target.value)} placeholder="M" maxLength={20} />
          </label>
          <button className="btn btn-primary" disabled={!riderId || issuing} onClick={issue}>
            {issuing && <Spinner />} Issue
          </button>
        </div>
        {riderId && (kit.data?.equipment.length ?? 0) > 0 && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {kit.data!.equipment.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-ink font-medium">
                    {item.itemType.replaceAll("_", " ").toLowerCase()}{item.size ? ` · ${item.size}` : ""}
                  </span>
                  {item.renewalDueAt && (
                    <span className="text-xs text-ink-muted">
                      Renews: {new Date(item.renewalDueAt).toLocaleDateString("en-IN")}
                    </span>
                  )}
                  {item.replacementFeeDeducted && (
                    <span className="text-xs text-danger font-medium">
                      Replacement charged: {formatRupees(item.replacementFeePaise ?? 0)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${
                    item.status === "ISSUED"
                      ? item.renewalStatus === "EXPIRED"
                        ? "badge-danger"
                        : item.renewalStatus === "DUE_SOON"
                          ? "badge-warn"
                          : "badge-success"
                      : "badge-neutral"
                  }`}>
                    {item.status === "ISSUED" && item.renewalStatus && item.renewalStatus !== "VALID"
                      ? item.renewalStatus.toLowerCase().replace("_", " ")
                      : item.status.toLowerCase()}
                  </span>
                  {item.status === "ISSUED" && (
                    <span className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => markKit(item.itemType as "HELMET", "RETURNED")}>Return</button>
                      <button className="btn btn-outline btn-sm text-danger" onClick={() => markKit(item.itemType as "HELMET", "LOST", true)}>Lost & charge</button>
                      <button className="btn btn-outline btn-sm" onClick={() => markKit(item.itemType as "HELMET", "RENEWED")}>Renew</button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        {rows.length === 0 ? <p className="notice">No insurance claims yet.</p> : rows.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}
      </section>
    </div>
  );
}

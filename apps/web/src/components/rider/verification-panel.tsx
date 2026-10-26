"use client";

import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera, Check, FileText, ShieldCheck, Upload, X } from "lucide-react";
import { useApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const DOC_LABELS: Record<string, { label: string; hint: string }> = {
  PROFILE_PHOTO: { label: "Profile photo", hint: "A clear photo of your face" },
  AADHAAR: { label: "Aadhaar", hint: "Front side showing your name and number" },
  PAN: { label: "PAN card", hint: "Optional for now, required for payouts" },
  DRIVING_LICENSE: { label: "Driving licence", hint: "Front and back in one photo" },
  VEHICLE_RC: { label: "Vehicle RC", hint: "Registration certificate for your vehicle" },
  VEHICLE_INSURANCE: { label: "Vehicle insurance", hint: "Current policy, if you have one" },
  POLICE_VERIFICATION: { label: "Police verification", hint: "Optional, speeds up approval" },
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    VERIFIED: "badge-success",
    IN_REVIEW: "badge-warn",
    REJECTED: "badge-danger",
    SUSPENDED: "badge-danger",
    PENDING: "badge-neutral",
  };
  return <span className={`badge ${map[status] ?? "badge-neutral"}`}>{status.toLowerCase().replace("_", " ")}</span>;
}

export function RiderVerificationPanel() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["rider-verification"], queryFn: () => api.getRiderVerification() });
  const [uploading, setUploading] = useState<string | null>(null);
  const [aadhaar, setAadhaar] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  if (profile.isPending) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-32" />
        <div className="skeleton h-64" />
      </div>
    );
  }
  if (!profile.data) return <p className="notice notice-danger">{errorMessage(profile.error)}</p>;
  const p = profile.data;
  const locked = p.status === "VERIFIED" || p.status === "IN_REVIEW";

  const upload = async (docType: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Images must be 2 MB or smaller", "error");
      return;
    }
    setUploading(docType);
    try {
      const { url } = await api.uploadRiderDocument(file);
      await api.registerRiderDocument(docType, url);
      await queryClient.invalidateQueries({ queryKey: ["rider-verification"] });
      toast(`${DOC_LABELS[docType]?.label ?? "Document"} uploaded`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-ink p-6 text-white sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-white/55">
              <ShieldCheck className="h-3.5 w-3.5" /> Delivery partner KYC
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{p.riderName}</h1>
            <p className="mt-1 text-sm text-white/60">
              {p.vehicleType.toLowerCase()} {p.vehicleNumber ? `· ${p.vehicleNumber}` : ""}
            </p>
          </div>
          <span
            className={`badge ${
              p.status === "VERIFIED" ? "bg-success text-white" : p.status === "REJECTED" || p.status === "SUSPENDED" ? "bg-danger text-white" : "bg-white/15 text-white"
            }`}
          >
            {p.status.toLowerCase().replace("_", " ")}
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-5 text-sm">
          <span>
            <span className="block text-white/45">Documents</span>
            <span className="mt-1 block font-medium tabular">
              {p.documents.filter((d) => d.status !== "REJECTED").length}/{p.requiredDocs.length}
            </span>
          </span>
          <span>
            <span className="block text-white/45">Background check</span>
            <span className="mt-1 block font-medium capitalize">{p.backgroundCheckStatus.toLowerCase()}</span>
          </span>
          <span>
            <span className="block text-white/45">Verified</span>
            <span className="mt-1 block font-medium">{p.verifiedAt ? formatDateTime(p.verifiedAt) : "—"}</span>
          </span>
        </div>
      </section>

      {p.status === "VERIFIED" && (
        <p className="notice notice-success">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> You&apos;re verified. Your badge is shown to customers and you can go online.
        </p>
      )}
      {p.status === "IN_REVIEW" && (
        <p className="notice notice-warn">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Your documents are with our verification team. This usually takes a few hours.
        </p>
      )}
      {p.rejectionReason && (
        <p className="notice notice-danger">
          <X className="mt-0.5 h-4 w-4 shrink-0" /> {p.rejectionReason}
        </p>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="h-section">Required documents</h2>
          <span className="text-xs text-ink-muted">JPEG, PNG or WebP · max 2 MB</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {p.requiredDocs.map((docType) => {
            const doc = p.documents.find((d) => d.docType === docType);
            const meta = DOC_LABELS[docType] ?? { label: docType, hint: "" };
            const verified = doc?.status === "VERIFIED";
            return (
              <div key={docType} className={`rounded-2xl border p-4 ${verified ? "border-success/30 bg-success-soft/40" : "border-line"}`}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${verified ? "bg-success text-white" : "bg-subtle text-ink-soft"}`}>
                    {verified ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{meta.label}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{meta.hint}</p>
                    {doc && (
                      <p className={`mt-2 text-xs font-medium ${doc.status === "REJECTED" ? "text-danger" : doc.status === "VERIFIED" ? "text-success" : "text-warn"}`}>
                        {doc.status.toLowerCase()}
                        {doc.reviewNote ? ` · ${doc.reviewNote}` : ""}
                      </p>
                    )}
                  </div>
                  {!locked && (
                    <>
                      <button
                        onClick={() => inputs.current[docType]?.click()}
                        disabled={uploading === docType}
                        className="btn btn-outline btn-sm"
                        aria-label={`Upload ${meta.label}`}
                      >
                        {uploading === docType ? <Spinner /> : doc ? "Replace" : <><Upload className="h-3.5 w-3.5" /> Upload</>}
                      </button>
                      <input
                        ref={(el) => {
                          inputs.current[docType] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => upload(docType, e.target.files?.[0])}
                      />
                    </>
                  )}
                  {locked && doc && (
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-ink-soft underline underline-offset-4">
                      View
                    </a>
                  )}
                </div>
                {doc?.fileUrl.startsWith("data:") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doc.fileUrl} alt={meta.label} className="mt-3 h-24 w-full rounded-xl object-cover" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {!locked && (
        <section className="rounded-3xl border border-line p-6">
          <h2 className="h-section">Finish verification</h2>
          <p className="mt-1 text-sm text-ink-muted">
            We only store the last 4 digits of your Aadhaar. Your documents are never shared with customers.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-[200px_1fr] sm:items-end">
            <Field label="Aadhaar last 4 digits">
              <input
                value={aadhaar}
                onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="4821"
                className="input"
              />
            </Field>
            <label className="flex cursor-pointer items-start gap-3 pb-1 text-sm text-ink-soft">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="checkbox mt-0.5" />
              <span>I consent to a background verification check and confirm these documents are mine.</span>
            </label>
          </div>
          {p.missingDocs.length > 0 && (
            <p className="mt-3 text-xs text-warn">
              Still needed: {p.missingDocs.map((d) => DOC_LABELS[d]?.label ?? d).join(", ")}
            </p>
          )}
          <button
            disabled={aadhaar.length !== 4 || !consent || submitting || p.missingDocs.length > 0}
            onClick={async () => {
              setSubmitting(true);
              try {
                await api.submitRiderVerification(aadhaar);
                await queryClient.invalidateQueries({ queryKey: ["rider-verification"] });
                await queryClient.invalidateQueries({ queryKey: ["rider-trip"] });
                toast("Submitted for verification", "success");
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setSubmitting(false);
              }
            }}
            className="btn btn-primary btn-lg mt-5 w-full sm:w-auto"
          >
            {submitting && <Spinner />} Submit for verification
          </button>
        </section>
      )}
    </div>
  );
}

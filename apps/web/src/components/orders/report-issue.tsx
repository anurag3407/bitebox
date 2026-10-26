"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, Check, ImagePlus, ThumbsDown, X } from "lucide-react";
import { QuoteLineBreakdown } from "@startup/contracts";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import type { OrderIssueDto } from "@startup/api-client";

const CATEGORIES = [
  { value: "MISSING_ITEM", label: "Item missing", hint: "Something you paid for didn't arrive", instant: "Instant credits for the missing item, up to ₹500" },
  { value: "WRONG_ITEM", label: "Wrong item", hint: "You received something else", instant: "Instant credits for the affected item, up to ₹500" },
  { value: "COLD_FOOD", label: "Cold food", hint: "It arrived lukewarm or cold", instant: "Instant credits for 20% of the food value" },
  { value: "QUALITY", label: "Poor quality", hint: "Not up to the usual standard", instant: "Instant credits for 25% of the food value" },
  { value: "SPILLED", label: "Spilled or damaged", hint: "Packaging leaked or broke", instant: "Instant credits for 30% of the food value" },
  { value: "LATE_DELIVERY", label: "Very late", hint: "Delivered well past the promise", instant: "Credits if the delivery was 20+ minutes late" },
  { value: "NOT_DELIVERED", label: "Never arrived", hint: "Marked delivered, but I didn't get it", instant: "Our team investigates this right away" },
  { value: "OTHER", label: "Something else", hint: "Tell us what happened", instant: "Our team will review and reply" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export function ReportIssueButton({
  orderId,
  items,
  className = "btn btn-outline",
}: {
  orderId: string;
  items: QuoteLineBreakdown[];
  className?: string;
}) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderIssueDto | null>(null);

  const choice = CATEGORIES.find((c) => c.value === category);
  const needsItems = category === "MISSING_ITEM" || category === "WRONG_ITEM";
  const canSubmit =
    !!category &&
    description.trim().length >= 5 &&
    (!needsItems || selected.length > 0) &&
    !submitting;

  const reset = () => {
    setCategory(null);
    setSelected([]);
    setDescription("");
    setPhotos([]);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews([]);
    setResult(null);
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos, ...Array.from(files)].slice(0, 3);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPhotos(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!category) return;
    setSubmitting(true);
    try {
      const uploaded: string[] = [];
      for (const file of photos) {
        if (file.size > 2 * 1024 * 1024) throw new Error("Photos must be 2 MB or smaller.");
        const { url } = await api.uploadImage(file);
        uploaded.push(url);
      }
      const issue = await api.createOrderIssue(orderId, {
        category,
        description: description.trim(),
        itemIds: selected,
        photos: uploaded,
      });
      setResult(issue);
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      await queryClient.invalidateQueries({ queryKey: ["order-issues", orderId] });
      if (issue.status === "RESOLVED") {
        toast(`${formatRupees(issue.walletCreditPaise)} credits added to your wallet`, "success");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        <ThumbsDown className="h-4 w-4" /> Report a problem
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title={result ? "We're on it" : "What went wrong?"}
        description={result ? undefined : "Most problems are resolved instantly with BiteBox Credits."}
        size="lg"
        footer={
          result ? (
            <button
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="btn btn-primary btn-block"
            >
              Done
            </button>
          ) : (
            <button onClick={submit} disabled={!canSubmit} className="btn btn-primary btn-block">
              {submitting && <Spinner />} {submitting ? "Sending…" : "Submit report"}
            </button>
          )
        }
      >
        {result ? (
          <div className="py-2 text-center">
            <span
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
                result.status === "RESOLVED" ? "bg-success text-white" : "bg-warn-soft text-warn"
              }`}
            >
              {result.status === "RESOLVED" ? <Check className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
            </span>
            {result.status === "RESOLVED" ? (
              <>
                <p className="mt-5 text-lg font-semibold text-ink">
                  {formatRupees(result.walletCreditPaise)} in BiteBox Credits added
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{result.adminNote}</p>
                <p className="mt-4 text-xs text-ink-muted">Use them on your next order. They never expire.</p>
              </>
            ) : (
              <>
                <p className="mt-5 text-lg font-semibold text-ink">Support is reviewing this</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                  We&apos;ve opened a priority conversation. You&apos;ll get a reply in Support, usually within a few minutes.
                </p>
                {result.supportTicketId && (
                  <a href={`/support/${result.supportTicketId}`} className="btn btn-outline mt-5">
                    Open conversation
                  </a>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setCategory(c.value);
                    setSelected([]);
                  }}
                  aria-pressed={category === c.value}
                  className={`rounded-2xl border p-3 text-left transition ${
                    category === c.value ? "border-ink bg-subtle" : "border-line hover:border-line-strong"
                  }`}
                >
                  <span className="block text-[13px] font-medium text-ink">{c.label}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-ink-muted">{c.hint}</span>
                </button>
              ))}
            </div>

            {choice && (
              <p className="notice notice-success">
                <Check className="mt-0.5 h-4 w-4 shrink-0" /> {choice.instant}
              </p>
            )}

            {needsItems && (
              <div>
                <p className="label">Which items?</p>
                <div className="space-y-2">
                  {items.map((item) => (
                    <label key={item.menuItemId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.menuItemId)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, item.menuItemId] : prev.filter((id) => id !== item.menuItemId)
                          )
                        }
                        className="checkbox"
                      />
                      <span className="flex-1 text-ink">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="text-ink-muted tabular">{formatRupees(item.lineTotalPaise)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Field label="Tell us more" hint="At least a few words help us fix this for you.">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                className="input"
                placeholder="The biryani had no chicken, the naan was missing…"
              />
            </Field>

            <div>
              <p className="label">Photos <span className="font-normal text-ink-muted">(optional, up to 3)</span></p>
              <div className="flex flex-wrap gap-3">
                {previews.map((src, i) => (
                  <span key={src} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Problem photo ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => {
                        URL.revokeObjectURL(src);
                        const next = photos.filter((_, idx) => idx !== i);
                        setPhotos(next);
                        setPreviews(next.map((f) => URL.createObjectURL(f)));
                      }}
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {photos.length < 3 && (
                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-ink-muted hover:border-ink hover:text-ink">
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px]">Add</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
                  </label>
                )}
              </div>
            </div>
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <Camera className="h-3.5 w-3.5" /> Photos are only shared with BiteBox support.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

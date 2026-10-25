"use client";

import React, { useState } from "react";
import { LogoMark } from "@/components/brand/logo";

/** <img> that swaps to a quiet branded placeholder when the remote image is missing or fails. */
export function SafeImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span role={alt ? "img" : undefined} aria-label={alt || undefined} className={`flex items-center justify-center bg-subtle ${className ?? ""}`}>
        <LogoMark className="h-1/4 max-h-10 w-1/4 max-w-10 opacity-30" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary merchant URLs; next/image would need every host allow-listed
    <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />
  );
}

/** Indian FSSAI-style veg / non-veg marker. */
export function VegMark({ tag }: { tag: string }) {
  const veg = tag === "VEG" || tag === "VEGAN";
  const egg = tag === "EGG";
  const color = veg ? "border-success text-success" : egg ? "border-warn text-warn" : "border-danger text-danger";
  return (
    <span title={veg ? "Vegetarian" : egg ? "Contains egg" : "Non-vegetarian"} className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span className="sr-only">{veg ? "Vegetarian" : egg ? "Contains egg" : "Non-vegetarian"}</span>
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={`inline-block ${className} animate-spin rounded-full border-2 border-current border-t-transparent`} aria-hidden />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-muted">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-16 text-center sm:py-20 ${className}`}>
      {icon && <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-subtle text-ink-soft [&>svg]:h-6 [&>svg]:w-6">{icon}</div>}
      <p className="text-lg font-semibold tracking-tight text-ink">{title}</p>
      {body && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

/** Small label + value pair used in stat rows. */
export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className={`rounded-3xl p-5 ${tone === "bad" ? "bg-danger-soft" : "bg-subtle"}`}>
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular ${tone === "bad" ? "text-danger" : tone === "good" ? "text-success" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

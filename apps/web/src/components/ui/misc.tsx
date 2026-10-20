"use client";

import React, { useState } from "react";

const FALLBACK = "/icons/icon-512.png";

/** <img> that swaps to a branded placeholder when the remote image fails. */
export function SafeImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={!src || failed ? FALLBACK : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${className ?? ""} ${!src || failed ? "object-contain p-6 bg-brand-light" : ""}`}
    />
  );
}

/** Indian FSSAI-style veg / non-veg marker. */
export function VegMark({ tag }: { tag: string }) {
  const veg = tag === "VEG" || tag === "VEGAN";
  return (
    <span
      title={veg ? "Vegetarian" : tag === "EGG" ? "Contains egg" : "Non-vegetarian"}
      className={`inline-flex w-3.5 h-3.5 border ${veg ? "border-success" : tag === "EGG" ? "border-amber-500" : "border-red-700"} items-center justify-center shrink-0`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${veg ? "bg-success" : tag === "EGG" ? "bg-amber-500" : "bg-red-700"}`} />
    </span>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <span className={`inline-block ${className} border-2 border-current border-t-transparent rounded-full animate-spin`} aria-hidden />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6 bg-surface-muted rounded-3xl border border-border">
      <p className="text-base font-bold text-text-primary">{title}</p>
      {body && <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

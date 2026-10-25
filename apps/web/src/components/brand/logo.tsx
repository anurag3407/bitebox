import React from "react";

/** A rounded box with a bite out of the corner. Same geometry as scripts/generate-icons.mjs. */
const MARK_PATH = "M10 2H21.29A7 7 0 0 0 30 10.71V22A8 8 0 0 1 22 30H10A8 8 0 0 1 2 22V10A8 8 0 0 1 10 2Z";

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d={MARK_PATH} className="fill-accent" />
    </svg>
  );
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-7 w-7" />
      {!compact && <span className="text-[19px] font-semibold tracking-tight text-ink">BiteBox</span>}
    </span>
  );
}

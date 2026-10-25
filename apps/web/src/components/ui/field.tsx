"use client";

import React, { useEffect, useState } from "react";

/** Label + control + optional hint, stacked with consistent spacing. */
export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** +91 prefixed 10-digit Indian mobile input. `value` excludes the prefix. */
export function PhoneInput({ value, onChange, required, id }: { value: string; onChange: (digits: string) => void; required?: boolean; id?: string }) {
  return (
    <div className="flex h-12 w-full items-center rounded-2xl border border-line bg-white transition focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/5">
      <span className="pl-4 pr-2 text-[15px] text-ink-muted">+91</span>
      <input
        id={id}
        required={required}
        inputMode="numeric"
        autoComplete="tel-national"
        pattern="[6-9][0-9]{9}"
        title="10-digit mobile number"
        maxLength={10}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
        className="h-full min-w-0 flex-1 rounded-r-2xl bg-transparent pr-4 text-[15px] text-ink outline-none placeholder:text-ink-muted"
        placeholder="98765 43210"
      />
    </div>
  );
}

/**
 * Rupee amount input that reports paise. Keeps its own text so partial input
 * such as "12." or "" survives re-renders instead of being reformatted mid-typing.
 */
export function MoneyInput({
  paise,
  onChange,
  placeholder = "0",
  className = "input",
  ariaLabel,
}: {
  paise: number;
  onChange: (paise: number) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(paise ? String(paise / 100) : "");
  useEffect(() => {
    // Sync external changes (e.g. a reset) without clobbering what the user is typing
    setText((current) => (Math.round(Number(current || 0) * 100) === paise ? current : paise ? String(paise / 100) : ""));
  }, [paise]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-muted">₹</span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
          if (/\.\d{3,}$/.test(next)) return;
          setText(next);
          onChange(Math.round(Number(next || 0) * 100));
        }}
        className={`${className} pl-8`}
      />
    </div>
  );
}

/** Accessible on/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-6 w-10" : "h-7 w-12";
  const knob = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const shift = size === "sm" ? "translate-x-4" : "translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${track} shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 ${checked ? "bg-success" : "bg-line-strong"}`}
    >
      <span className={`${knob} rounded-full bg-white shadow-sm transition-transform ${checked ? shift : "translate-x-0"}`} />
    </button>
  );
}

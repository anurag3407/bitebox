"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

/**
 * Accessible dialog: a bottom sheet on phones, a centred card on larger screens.
 * Escape closes, focus moves in once on open and is restored on close, background
 * scroll is locked.
 */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Parents often pass an inline onClose and re-render on polling; keep the
  // open/close effect keyed on `open` only so focus is not stolen mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]), textarea, select, button:not([data-modal-close])");
    (first ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full ${width} animate-sheet-up flex-col rounded-t-[28px] bg-white pb-safe shadow-pop outline-none sm:rounded-[28px] sm:pb-0`}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" data-modal-close className="btn btn-ghost btn-icon -mr-2 -mt-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children ? <div className="flex-1 overflow-y-auto px-6 py-4 sm:px-7">{children}</div> : <div className="h-3" />}
        {footer && <div className="px-6 pb-6 pt-3 sm:px-7 sm:pb-7">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Confirmation / short-answer dialog. Replaces window.confirm and window.prompt,
 * which block the page and look out of place in an installed app.
 */
export function ActionDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "default",
  input,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  input?: { label: string; placeholder?: string; initialValue?: string; minLength?: number };
  onConfirm: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = React.useState(input?.initialValue ?? "");
  const [busy, setBusy] = React.useState(false);
  useEffect(() => {
    if (open) setValue(input?.initialValue ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = !input || value.trim().length >= (input.minLength ?? 1);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onConfirm(value.trim());
      onClose();
    } catch {
      // the caller reports the error; keep the dialog open so the user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" form="action-dialog-form" disabled={!valid || busy} className={`btn flex-1 ${tone === "danger" ? "btn-danger" : "btn-primary"}`}>
            {confirmLabel}
          </button>
        </div>
      }
    >
      <form id="action-dialog-form" onSubmit={submit}>
        {input && (
          <label className="block">
            <span className="label">{input.label}</span>
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={input.placeholder} className="input" />
            {input.minLength && input.minLength > 1 && <span className="hint">At least {input.minLength} characters.</span>}
          </label>
        )}
      </form>
    </Modal>
  );
}

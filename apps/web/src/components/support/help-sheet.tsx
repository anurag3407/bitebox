"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SupportCategory } from "@startup/contracts";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";

const ISSUES: Array<{ category: SupportCategory; label: string }> = [
  { category: "MISSING_ITEM", label: "Something is missing" },
  { category: "WRONG_ITEM", label: "I got the wrong item" },
  { category: "QUALITY", label: "Food quality or hygiene" },
  { category: "LATE_DELIVERY", label: "My order is late" },
  { category: "PAYMENT", label: "Payment or refund" },
  { category: "CANCELLATION", label: "I want to cancel" },
  { category: "OTHER", label: "Something else" },
];

export function HelpSheet({ orderId, open, onClose }: { orderId?: string; open: boolean; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Start fresh each time the sheet opens
  useEffect(() => {
    if (!open) {
      setCategory(null);
      setMessage("");
    }
  }, [open]);

  const issue = ISSUES.find((i) => i.category === category);

  return (
    <Modal open={open} onClose={onClose} title={issue ? issue.label : "How can we help?"} description={issue ? "Tell us what happened and we'll take it from there." : "Our team usually replies within 10 minutes."}>
      {!category ? (
        <ul className="-mx-3 pb-2">
          {ISSUES.map((i) => (
            <li key={i.category}>
              <button onClick={() => setCategory(i.category)} className="flex w-full items-center justify-between rounded-2xl px-3 py-4 text-left text-[15px] text-ink transition-colors hover:bg-subtle">
                {i.label}
                <ChevronRight className="h-4 w-4 text-ink-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { ticketId } = await api.openTicket({ orderId, category, message: message.trim() });
              onClose();
              router.push(`/support/${ticketId}`);
            } catch (err) {
              toast(errorMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-5 pb-2"
        >
          <textarea
            autoFocus
            required
            minLength={3}
            maxLength={2000}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Which items, and what was wrong?"
            aria-label="Describe the problem"
            className="input"
          />
          <div className="flex gap-3">
            <button type="button" onClick={() => setCategory(null)} className="btn btn-secondary">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button disabled={busy || message.trim().length < 3} className="btn btn-primary flex-1">
              {busy && <Spinner />} Start chat
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

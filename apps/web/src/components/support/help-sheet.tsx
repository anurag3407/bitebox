"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { SupportCategory } from "@startup/contracts";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";

const ISSUES: Array<{ category: SupportCategory; label: string }> = [
  { category: "MISSING_ITEM", label: "Item(s) missing from my order" },
  { category: "WRONG_ITEM", label: "I received the wrong item" },
  { category: "QUALITY", label: "Food quality or hygiene issue" },
  { category: "LATE_DELIVERY", label: "My order is late" },
  { category: "PAYMENT", label: "Payment or refund question" },
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

  return (
    <Modal open={open} onClose={onClose} title="How can we help?" description="Our support team usually replies within 10 minutes.">
      {!category ? (
        <ul className="space-y-2">
          {ISSUES.map((i) => (
            <li key={i.category}>
              <button onClick={() => setCategory(i.category)} className="w-full text-left p-3 rounded-xl border border-border hover:border-brand text-sm font-semibold">
                {i.label}
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
          className="space-y-3"
        >
          <p className="text-sm font-bold">{ISSUES.find((i) => i.category === category)?.label}</p>
          <textarea
            autoFocus
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what happened (which items, what was wrong)"
            className="w-full p-3 bg-surface-muted border border-border rounded-xl text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setCategory(null)} className="px-4 py-2.5 rounded-xl border border-border text-sm font-bold">
              Back
            </button>
            <button disabled={busy} className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-bold flex items-center justify-center gap-2">
              {busy && <Spinner />} Start chat
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

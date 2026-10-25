"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupportTicket } from "@startup/api-client";
import { MessageCircle } from "lucide-react";
import { ChatThread } from "@/components/support/chat-thread";
import { MoneyInput } from "@/components/ui/field";
import { ActionDialog } from "@/components/ui/modal";
import { EmptyState, PageSpinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees, timeAgo } from "@/lib/format";

const category = (c: string) => c.replace(/_/g, " ").toLowerCase();

function TicketPanel({ ticketId, onChanged }: { ticketId: string; onChanged: () => void }) {
  const api = useApi();
  const toast = useToast();
  const thread = useQuery({ queryKey: ["admin-ticket", ticketId], queryFn: () => api.getTicket(ticketId, true), refetchInterval: 5000 });
  const [refundPaise, setRefundPaise] = useState(0);
  const [refunding, setRefunding] = useState(false);
  const [resolving, setResolving] = useState(false);
  if (!thread.data) return <PageSpinner />;
  const t = thread.data.ticket;

  return (
    <div className="flex h-[70vh] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{t.customerName}</p>
          <p className="text-sm capitalize text-ink-muted">
            {category(t.category)}
            {t.orderId && ` · order #${t.orderNumber}`}
          </p>
        </div>
        {t.orderId && (
          <div className="flex items-center gap-2">
            <div className="w-28">
              <MoneyInput paise={refundPaise} onChange={setRefundPaise} className="input input-sm" ariaLabel="Refund amount" />
            </div>
            <button disabled={!refundPaise} onClick={() => setRefunding(true)} className="btn btn-outline btn-sm">
              Refund
            </button>
          </div>
        )}
        {t.status !== "RESOLVED" && (
          <button onClick={() => setResolving(true)} className="btn btn-success btn-sm">
            Resolve
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 pt-4">
        <ChatThread
          thread={thread.data}
          viewer="AGENT"
          onSend={async (body) => {
            try {
              await api.replyToTicket(ticketId, body, true);
              thread.refetch();
              onChanged();
            } catch (err) {
              toast(errorMessage(err), "error");
            }
          }}
        />
      </div>

      <ActionDialog
        open={refunding}
        onClose={() => setRefunding(false)}
        title={`Refund ${formatRupees(refundPaise)}?`}
        description="The customer is refunded to their original payment method and told in this chat."
        confirmLabel="Refund"
        onConfirm={async () => {
          try {
            await api.adminRefundOrder(t.orderId!, refundPaise, `Support: ${t.category}`);
            await api.replyToTicket(ticketId, `We've refunded ${formatRupees(refundPaise)} to your original payment method. It usually reflects in 1–7 working days.`, true);
            toast("Refund issued", "success");
            setRefundPaise(0);
            thread.refetch();
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
      <ActionDialog
        open={resolving}
        onClose={() => setResolving(false)}
        title="Resolve conversation"
        confirmLabel="Resolve"
        input={{ label: "Resolution summary", placeholder: "e.g. Refunded the missing item" }}
        onConfirm={async (resolution) => {
          try {
            await api.resolveTicket(ticketId, resolution);
            thread.refetch();
            onChanged();
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
    </div>
  );
}

export function SupportTab() {
  const api = useApi();
  const [status, setStatus] = useState<SupportTicket["status"] | undefined>("OPEN");
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useQuery({ queryKey: ["admin-support", status], queryFn: () => api.getSupportQueue(status), refetchInterval: 10_000 });

  return (
    <div className="grid gap-8 md:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(
            [
              ["OPEN", "Needs reply"],
              ["AWAITING_CUSTOMER", "Waiting"],
              ["RESOLVED", "Resolved"],
            ] as const
          ).map(([s, label]) => (
            <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)} className="chip">
              {label}
            </button>
          ))}
        </div>
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
          {queue.data?.map((t) => (
            <li key={t.id}>
              <button onClick={() => setSelected(t.id)} className={`w-full rounded-2xl p-4 text-left transition-colors ${selected === t.id ? "bg-subtle" : "hover:bg-subtle/60"}`}>
                <p className="flex justify-between gap-2 text-sm">
                  <span className="font-medium text-ink">{t.customerName}</span>
                  <span className="text-xs text-ink-muted">{timeAgo(t.lastMessageAt)}</span>
                </p>
                <p className="mt-0.5 text-xs capitalize text-ink-muted">
                  {category(t.category)}
                  {t.orderNumber && ` · #${t.orderNumber}`}
                </p>
                <p className="mt-1.5 truncate text-sm text-ink-soft">{t.lastMessage}</p>
              </button>
            </li>
          ))}
          {queue.data?.length === 0 && <li className="p-4 text-sm text-ink-muted">Queue is empty.</li>}
        </ul>
      </div>
      <div className="card p-6">
        {selected ? <TicketPanel key={selected} ticketId={selected} onChanged={() => queue.refetch()} /> : <EmptyState icon={<MessageCircle />} title="Select a conversation" />}
      </div>
    </div>
  );
}

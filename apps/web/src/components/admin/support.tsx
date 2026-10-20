"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupportTicket } from "@startup/api-client";
import { ChatThread } from "@/components/support/chat-thread";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";

function TicketPanel({ ticketId, onChanged }: { ticketId: string; onChanged: () => void }) {
  const api = useApi();
  const toast = useToast();
  const thread = useQuery({ queryKey: ["admin-ticket", ticketId], queryFn: () => api.getTicket(ticketId, true), refetchInterval: 5000 });
  const [refund, setRefund] = useState("");
  if (!thread.data) return <Spinner />;
  const t = thread.data.ticket;

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border text-xs">
        <span className="font-bold">{t.customerName}</span>
        <span className="text-text-secondary">· {t.category.replace("_", " ").toLowerCase()}</span>
        {t.orderId && <span className="text-text-secondary">· order #{t.orderNumber}</span>}
        <div className="ml-auto flex gap-2">
          {t.orderId && (
            <>
              <input value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^\d.]/g, ""))} placeholder="₹" className="w-20 p-1.5 rounded-lg border border-border" />
              <button
                disabled={!refund}
                onClick={async () => {
                  try {
                    await api.adminRefundOrder(t.orderId!, Math.round(Number(refund) * 100), `Support: ${t.category}`);
                    await api.replyToTicket(ticketId, `We've refunded ₹${refund} to your original payment method. It usually reflects in 1–7 working days.`, true);
                    toast("Refund issued", "success");
                    setRefund("");
                    thread.refetch();
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
                className="px-2 py-1.5 rounded-lg bg-text-primary text-white font-bold disabled:opacity-40"
              >
                Refund
              </button>
            </>
          )}
          {t.status !== "RESOLVED" && (
            <button
              onClick={async () => {
                const resolution = prompt("Resolution summary")?.trim();
                if (!resolution) return;
                try {
                  await api.resolveTicket(ticketId, resolution);
                  thread.refetch();
                  onChanged();
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
              className="px-2 py-1.5 rounded-lg bg-success text-white font-bold"
            >
              Resolve
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 pt-3">
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
    </div>
  );
}

export function SupportTab() {
  const api = useApi();
  const [status, setStatus] = useState<SupportTicket["status"] | undefined>("OPEN");
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useQuery({ queryKey: ["admin-support", status], queryFn: () => api.getSupportQueue(status), refetchInterval: 10_000 });

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          {([["OPEN", "Needs reply"], ["AWAITING_CUSTOMER", "Waiting"], ["RESOLVED", "Resolved"]] as const).map(([s, label]) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${status === s ? "bg-text-primary text-white" : "border-border"}`}>
              {label}
            </button>
          ))}
        </div>
        <ul className="space-y-1 max-h-[70vh] overflow-y-auto">
          {queue.data?.map((t) => (
            <li key={t.id}>
              <button onClick={() => setSelected(t.id)} className={`w-full text-left p-3 rounded-xl border ${selected === t.id ? "border-brand bg-brand-light/30" : "border-border bg-white"}`}>
                <p className="text-sm font-bold flex justify-between">
                  <span>{t.customerName}</span>
                  <span className="text-[11px] font-normal text-text-secondary">{timeAgo(t.lastMessageAt)}</span>
                </p>
                <p className="text-[11px] text-text-secondary">
                  {t.category.replace("_", " ").toLowerCase()}
                  {t.orderNumber && ` · #${t.orderNumber}`}
                </p>
                <p className="text-xs truncate">{t.lastMessage}</p>
              </button>
            </li>
          ))}
          {queue.data?.length === 0 && <li className="text-xs text-text-secondary p-3">Queue is empty 🎉</li>}
        </ul>
      </div>
      <div className="rounded-2xl border border-border bg-white p-4">
        {selected ? <TicketPanel key={selected} ticketId={selected} onChanged={() => queue.refetch()} /> : <p className="text-sm text-text-secondary">Select a conversation.</p>}
      </div>
    </div>
  );
}

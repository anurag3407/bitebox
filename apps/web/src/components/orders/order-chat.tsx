"use client";

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { errorMessage, useApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/misc";
import { formatTime } from "@/lib/format";

type Channel = "CUSTOMER_RIDER" | "CUSTOMER_MERCHANT";
type Viewer = "CUSTOMER" | "RIDER" | "MERCHANT";

const QUICK_REPLIES: Record<Viewer, Record<Channel, string[]>> = {
  CUSTOMER: {
    CUSTOMER_RIDER: ["Where are you?", "Please call me", "Leave it at the door"],
    CUSTOMER_MERCHANT: ["Please make it less spicy", "Is my order being prepared?", "Please add cutlery"],
  },
  RIDER: {
    CUSTOMER_RIDER: ["I'm at the restaurant", "On my way", "I've arrived"],
    CUSTOMER_MERCHANT: [],
  },
  MERCHANT: {
    CUSTOMER_RIDER: [],
    CUSTOMER_MERCHANT: ["Your order is being prepared", "The rider has picked up your order"],
  },
};

export function OrderChat({
  orderId,
  channel,
  viewer,
  title,
  subtitle,
  compact = false,
}: {
  orderId: string;
  channel: Channel;
  viewer: Viewer;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ["order-messages", orderId, channel, viewer],
    queryFn: () => api.getOrderMessages(orderId, channel),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.data?.length]);

  const send = async (text: string) => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await api.sendOrderMessage(orderId, channel, value);
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["order-messages", orderId, channel, viewer] });
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-line">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-ink-soft">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title ?? (channel === "CUSTOMER_RIDER" ? "Delivery partner" : "Restaurant")}</p>
          <p className="truncate text-xs text-ink-muted">{subtitle ?? "Chat about this order"}</p>
        </div>
      </div>

      <div ref={scroller} className={`space-y-3 overflow-y-auto px-5 py-4 ${compact ? "max-h-56" : "max-h-80"}`}>
        {messages.isPending ? (
          <div className="flex justify-center py-6 text-ink-muted">
            <Spinner />
          </div>
        ) : messages.data?.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">No messages yet. Say hello 👋</p>
        ) : (
          messages.data?.map((m) => {
            const mine = m.senderType === viewer;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-subtle text-ink"
                  }`}
                >
                  {m.senderType === "SYSTEM" && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">BiteBox</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-right text-[10px] ${mine ? "text-white/50" : "text-ink-muted"}`}>{formatTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
          {QUICK_REPLIES[viewer][channel].map((q) => (
            <button key={q} onClick={() => send(q)} className="chip h-8 shrink-0 px-3 text-xs">
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(body);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            placeholder="Type a message…"
            aria-label="Message"
            className="input h-11 min-w-0 flex-1 rounded-full"
          />
          <button disabled={!body.trim() || sending} aria-label="Send message" className="btn btn-primary btn-icon h-11 w-11 shrink-0 rounded-full">
            {sending ? <Spinner /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}

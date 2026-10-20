"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { SupportThread } from "@startup/api-client";
import { Spinner } from "@/components/ui/misc";
import { formatTime } from "@/lib/format";

/** Conversation view shared by the customer help page and the agent console. */
export function ChatThread({
  thread,
  viewer,
  onSend,
  disabled,
}: {
  thread: SupportThread;
  viewer: "CUSTOMER" | "AGENT";
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.messages.length]);

  return (
    <div className="flex flex-col h-full min-h-[50vh]">
      <ol className="flex-1 space-y-3 overflow-y-auto p-1" aria-live="polite">
        {thread.messages.map((m) => {
          const mine = m.senderType === viewer;
          if (m.senderType === "SYSTEM") {
            return (
              <li key={m.id} className="text-center text-[11px] text-text-secondary px-6">
                {m.body}
              </li>
            );
          }
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-brand text-white rounded-br-sm" : "bg-surface-muted rounded-bl-sm"}`}>
                {!mine && <p className="text-[10px] font-bold opacity-70 mb-0.5">{m.senderType === "AGENT" ? `Support${m.senderName ? ` · ${m.senderName}` : ""}` : thread.ticket.customerName}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${mine ? "text-white/70" : "text-text-secondary"}`}>{formatTime(m.createdAt)}</p>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setSending(true);
          try {
            await onSend(draft.trim());
            setDraft("");
          } finally {
            setSending(false);
          }
        }}
        className="flex gap-2 pt-3 border-t border-border mt-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          disabled={disabled}
          placeholder={disabled ? "This conversation is closed" : "Type a message"}
          aria-label="Message"
          className="flex-1 px-4 py-2.5 rounded-full bg-surface-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <button disabled={sending || !draft.trim()} aria-label="Send" className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center disabled:opacity-50">
          {sending ? <Spinner /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}

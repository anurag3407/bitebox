"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
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
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.messages.length]);

  return (
    <div className="flex h-full min-h-[50vh] flex-col">
      <ol className="flex-1 space-y-4 overflow-y-auto py-2" aria-live="polite">
        {thread.messages.map((m) => {
          const mine = m.senderType === viewer;
          if (m.senderType === "SYSTEM") {
            return (
              <li key={m.id} className="px-6 py-2 text-center text-xs text-ink-muted">
                {m.body}
              </li>
            );
          }
          return (
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && (
                <p className="mb-1 px-1 text-xs text-ink-muted">{m.senderType === "AGENT" ? `Support${m.senderName ? ` · ${m.senderName}` : ""}` : thread.ticket.customerName}</p>
              )}
              <div className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${mine ? "rounded-br-lg bg-ink text-white" : "rounded-bl-lg bg-subtle text-ink"}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
              <p className="mt-1 px-1 text-[11px] text-ink-muted">{formatTime(m.createdAt)}</p>
            </li>
          );
        })}
        <li ref={endRef} aria-hidden />
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
        className="mt-3 flex items-center gap-2 rounded-full border border-line bg-white p-1.5 pl-5 focus-within:border-ink"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          disabled={disabled}
          placeholder={disabled ? "This conversation is closed" : "Write a message"}
          aria-label="Message"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
        />
        <button disabled={sending || !draft.trim()} aria-label="Send" className="btn btn-primary btn-icon h-10 w-10">
          {sending ? <Spinner /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

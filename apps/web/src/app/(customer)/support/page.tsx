"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { HelpSheet } from "@/components/support/help-sheet";
import { EmptyState } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth-context";
import { useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const STATUS_LABEL = { OPEN: "Waiting for support", AWAITING_CUSTOMER: "Support replied", RESOLVED: "Resolved" } as const;

export default function SupportListPage() {
  const api = useApi();
  const { isSignedIn, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api.getMyTickets(), enabled: isSignedIn });

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <EmptyState title="Sign in to contact support" action={<Link href="/sign-in?redirect_url=/support" className="inline-block px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl">Sign in</Link>} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Help & support</h1>
        <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold">
          New request
        </button>
      </div>
      <p className="text-sm text-text-secondary">For a problem with an order, open the order and tap “Get help” so we can see the details.</p>
      {tickets.data?.length === 0 && <EmptyState title="No conversations yet" />}
      <ul className="space-y-2">
        {tickets.data?.map((t) => (
          <li key={t.id}>
            <Link href={`/support/${t.id}`} className="flex gap-3 p-4 rounded-2xl border border-border hover:shadow-md">
              <MessageCircle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-bold">{t.orderNumber ? `Order #${t.orderNumber}` : "General question"}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === "AWAITING_CUSTOMER" ? "bg-brand-light text-brand" : t.status === "RESOLVED" ? "bg-success-light text-success" : "bg-surface-muted"}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
                <p className="text-xs text-text-secondary truncate mt-0.5">{t.lastMessage}</p>
                <p className="text-[11px] text-text-secondary mt-1">{timeAgo(t.lastMessageAt)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <HelpSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

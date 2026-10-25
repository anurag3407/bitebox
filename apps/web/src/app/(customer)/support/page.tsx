"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageCircle, Plus } from "lucide-react";
import { HelpSheet } from "@/components/support/help-sheet";
import { EmptyState, PageSpinner } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth-context";
import { useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const STATUS = {
  OPEN: { label: "Waiting for support", badge: "badge-neutral" },
  AWAITING_CUSTOMER: { label: "New reply", badge: "badge-accent" },
  RESOLVED: { label: "Resolved", badge: "badge-success" },
} as const;

export default function SupportListPage() {
  const api = useApi();
  const { isSignedIn, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api.getMyTickets(), enabled: isSignedIn });

  if (!isLoaded) return <PageSpinner />;
  if (!isSignedIn) {
    return (
      <EmptyState
        icon={<MessageCircle />}
        title="Sign in to contact support"
        action={
          <Link href="/sign-in?redirect_url=/support" className="btn btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="page-narrow pb-16 pt-10 sm:pt-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Help</h1>
          <p className="mt-2 text-[15px] text-ink-muted">For a problem with an order, open the order and tap “Get help”.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn btn-primary shrink-0">
          <Plus className="h-4 w-4" /> New
        </button>
      </div>

      <div className="mt-10">
        {tickets.isPending ? (
          <div className="skeleton h-32" />
        ) : tickets.data?.length === 0 ? (
          <EmptyState icon={<MessageCircle />} title="No conversations yet" body="Questions you ask our team will appear here." />
        ) : (
          <ul className="rows">
            {tickets.data?.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="group flex items-center gap-4 py-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-ink">{t.orderNumber ? `Order #${t.orderNumber}` : "General question"}</p>
                      <span className={`badge ${STATUS[t.status].badge}`}>{STATUS[t.status].label}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-ink-muted">{t.lastMessage}</p>
                    <p className="mt-1 text-xs text-ink-muted">{timeAgo(t.lastMessageAt)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <HelpSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Bell, CalendarDays, Crown, Gift, MessageCircle, Receipt } from "lucide-react";
import { EmptyState, PageSpinner } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth-context";
import { useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";

function iconFor(kind: string) {
  if (kind.startsWith("order.")) return Receipt;
  if (kind.startsWith("membership.")) return Crown;
  if (kind.startsWith("referral.") || kind.startsWith("loyalty.")) return Gift;
  if (kind.startsWith("support.") || kind.startsWith("order.issue")) return MessageCircle;
  if (kind.startsWith("dining.")) return CalendarDays;
  if (kind.startsWith("refund.")) return AlertTriangle;
  return Bell;
}

export default function NotificationsPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const notifications = useQuery({
    queryKey: ["notifications-page"],
    queryFn: () => api.getNotifications(50),
    enabled: isLoaded && isSignedIn,
    refetchInterval: 30_000,
  });

  const markRead = async (ids?: string[]) => {
    await api.markNotificationsRead(ids);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications-page"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  if (!isLoaded) return <PageSpinner />;
  if (!isSignedIn) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Sign in to see notifications"
        body="Order updates, refunds, referrals and Gold rewards live here."
        action={
          <Link href="/sign-in?redirect_url=/notifications" className="btn btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }

  const list = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <div className="page max-w-2xl pb-16 pt-8 sm:pt-12">
      <Link href="/" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Notifications</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {unread > 0 ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You're all caught up."}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={() => markRead()} className="btn btn-outline btn-sm">
            Mark all read
          </button>
        )}
      </div>

      {notifications.isPending ? (
        <div className="mt-8 space-y-3">
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<Bell />} title="No notifications yet" body="Order updates and rewards will show up here." />
      ) : (
        <ul className="mt-8 divide-y divide-line">
          {list.map((n) => {
            const Icon = iconFor(n.kind);
            return (
              <li key={n.id}>
                <Link
                  href={n.url ?? "/"}
                  onClick={() => {
                    if (!n.readAt) void markRead([n.id]);
                  }}
                  className={`flex gap-4 py-5 transition-colors hover:bg-subtle ${n.readAt ? "" : "bg-accent-soft/40"}`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${n.readAt ? "bg-subtle text-ink-muted" : "bg-accent-soft text-accent"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.readAt ? "text-ink-soft" : "font-semibold text-ink"}`}>{n.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-muted">{n.body}</span>
                    <span className="mt-2 block text-xs text-ink-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

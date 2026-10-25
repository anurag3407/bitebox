"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ChatThread } from "@/components/support/chat-thread";
import { EmptyState, PageSpinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";

export default function SupportThreadPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const api = useApi();
  const toast = useToast();
  const { isSignedIn } = useAuth();
  const thread = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => api.getTicket(ticketId),
    enabled: isSignedIn,
    refetchInterval: 5000,
  });

  if (thread.isPending) return <PageSpinner />;
  if (!thread.data) return <EmptyState title="Conversation not found" body={errorMessage(thread.error)} />;
  const t = thread.data.ticket;

  return (
    <div className="page-narrow flex h-[calc(100dvh-9rem)] flex-col pt-6 sm:h-[calc(100dvh-72px)] sm:pb-8">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <Link href="/support" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Help
        </Link>
        {t.orderId && (
          <Link href={`/orders/${t.orderId}`} className="link text-sm">
            Order #{t.orderNumber}
          </Link>
        )}
      </div>
      {t.status === "RESOLVED" && <p className="notice notice-success mt-4">Resolved: {t.resolution}. Reply to reopen.</p>}
      <div className="min-h-0 flex-1 pt-4">
        <ChatThread
          thread={thread.data}
          viewer="CUSTOMER"
          onSend={async (body) => {
            try {
              await api.replyToTicket(ticketId, body);
              await thread.refetch();
            } catch (err) {
              toast(errorMessage(err), "error");
            }
          }}
        />
      </div>
    </div>
  );
}

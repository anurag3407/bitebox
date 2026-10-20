"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ChatThread } from "@/components/support/chat-thread";
import { EmptyState, Spinner } from "@/components/ui/misc";
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

  if (thread.isPending) return <div className="p-10 text-center"><Spinner /></div>;
  if (!thread.data) return <div className="max-w-md mx-auto my-16 px-4"><EmptyState title="Conversation not found" body={errorMessage(thread.error)} /></div>;
  const t = thread.data.ticket;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-9rem)]">
      <div className="flex items-center justify-between mb-3">
        <Link href="/support" className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
          <ArrowLeft className="w-4 h-4" /> All conversations
        </Link>
        {t.orderId && (
          <Link href={`/orders/${t.orderId}`} className="text-xs font-bold text-brand">
            Order #{t.orderNumber}
          </Link>
        )}
      </div>
      {t.status === "RESOLVED" && <p className="text-xs p-2 rounded-lg bg-success-light text-success mb-2">Resolved: {t.resolution}. Reply to reopen.</p>}
      <div className="flex-1 min-h-0">
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

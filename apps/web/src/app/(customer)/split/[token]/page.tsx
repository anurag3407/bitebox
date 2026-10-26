"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, HandCoins, Wallet } from "lucide-react";
import { PageSpinner, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi, useMe } from "@/lib/api";
import { formatRupees } from "@/lib/format";

export default function SplitBillPage() {
  const { token } = useParams<{ token: string }>();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isSignedIn, isLoaded } = useAuth();
  const me = useMe();
  const split = useQuery({ queryKey: ["shared-split", token], queryFn: () => api.getSharedSplit(token), enabled: !!token });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet(), enabled: isSignedIn });
  const [paying, setPaying] = useState(false);

  if (!isLoaded || split.isPending) return <PageSpinner />;
  if (!split.data) {
    return (
      <div className="page-narrow py-16 text-center">
        <h1 className="h-page">Split not found</h1>
        <p className="mt-3 text-sm text-ink-muted">{errorMessage(split.error, "This bill split link is invalid or has been removed.")}</p>
        <Link href="/" className="btn btn-primary mt-6">Go home</Link>
      </div>
    );
  }
  const bill = split.data.split;
  const meId = me.data?.id;
  const nextPending = bill.shares.find((share) => share.status === "PENDING");
  const myPaid = bill.shares.some((share) => share.payerId === meId);
  const host = bill.hostId === meId;
  const balance = wallet.data?.account.balancePaise ?? 0;

  const pay = async () => {
    setPaying(true);
    try {
      await api.paySharedSplit(token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shared-split", token] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      toast("Share paid from your BiteBox Credits", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="page-narrow py-12">
      <div className="rounded-3xl border border-line bg-white p-7 text-center">
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.12em] text-ink-muted">
          <HandCoins className="h-4 w-4" /> Split the bill
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{bill.restaurantName}</h1>
        <p className="mt-1 text-sm text-ink-muted">Order #{bill.orderNumber} · hosted by {bill.hostName.split(" ")[0]}</p>
        <p className="mt-6 text-4xl font-semibold tracking-tight text-ink tabular">{formatRupees(bill.totalPaise)}</p>
        <p className="mt-1 text-sm text-ink-muted">Split between {bill.parts} friends</p>

        {bill.status === "SETTLED" ? (
          <p className="notice notice-success mt-6">
            <Check className="mt-0.5 h-4 w-4 shrink-0" /> Every share is paid. This bill is settled.
          </p>
        ) : !isSignedIn ? (
          <div className="mt-6">
            <p className="text-sm text-ink-muted">Sign in to pay {nextPending ? formatRupees(nextPending.amountPaise) : "your share"} from your credits.</p>
            <Link href={`/sign-in?redirect_url=/split/${token}`} className="btn btn-primary mt-4">Sign in to pay</Link>
          </div>
        ) : host ? (
          <p className="notice notice-neutral mt-6">
            This is your split. Share the link with friends; their payments land in your credits.
          </p>
        ) : myPaid ? (
          <p className="notice notice-success mt-6">
            <Check className="mt-0.5 h-4 w-4 shrink-0" /> You have paid your share. Thank you.
          </p>
        ) : nextPending ? (
          <div className="mt-6">
            <p className="text-sm text-ink-muted">
              Your share is <b className="text-ink">{formatRupees(nextPending.amountPaise)}</b>.
            </p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
              <Wallet className="h-3.5 w-3.5" /> {formatRupees(balance)} credits available
            </p>
            <button
              className="btn btn-primary btn-lg btn-block mt-4"
              disabled={paying || balance < nextPending.amountPaise}
              onClick={pay}
            >
              {paying ? <Spinner /> : <HandCoins className="h-4 w-4" />}
              {paying ? "Paying…" : balance < nextPending.amountPaise ? "Not enough credits" : `Pay ${formatRupees(nextPending.amountPaise)}`}
            </button>
            {balance < nextPending.amountPaise && (
              <p className="mt-2 text-xs text-ink-muted">
                <Link href="/account?tab=wallet" className="underline underline-offset-4 hover:text-ink">Add credits</Link> or ask the host to cover this share.
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-6 space-y-2 border-t border-line pt-4 text-left">
          {bill.shares.map((share) => (
            <div key={share.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Share {share.shareIndex}</span>
              <span className="tabular text-ink">{formatRupees(share.amountPaise)}</span>
              <span className={share.status === "PAID" ? "text-success" : "text-ink-muted"}>
                {share.status === "PAID" ? `paid${share.payerName ? ` · ${share.payerName.split(" ")[0]}` : ""}` : "pending"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Building2, Check, Clock, MapPin, ReceiptText, UtensilsCrossed, Wallet } from "lucide-react";
import { PageSpinner, Stat } from "@/components/ui/misc";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

export default function CorporatePage() {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const membership = useQuery({
    queryKey: ["corporate-membership"],
    queryFn: () => api.getCorporateMembership(),
    enabled: isLoaded && isSignedIn,
  });

  if (!isLoaded || (isSignedIn && membership.isPending)) return <PageSpinner />;
  if (isSignedIn && membership.isError) {
    return <div className="page py-10"><p className="notice notice-danger">{errorMessage(membership.error)}</p></div>;
  }
  const m = membership.data;

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <Briefcase className="h-3.5 w-3.5" /> BiteBox for Work
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Lunch on
                <br />
                the company.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                A daily allowance from your workplace, applied automatically at checkout. You pay only
                the overage, the company gets one consolidated GST invoice.
              </p>
            </div>
            {m?.member && (
              <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> {m.companyName}</span>
                <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {formatRupees(m.remainingAllowancePaise ?? 0)} left today</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="page">
        {m?.member ? (
          <>
            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="h-section">Your allowance</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {m.companyName} · Cost centre {m.costCenterCode}
                  </p>
                </div>
                <Link href="/" className="btn btn-primary">Order lunch</Link>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Daily allowance"
                  value={formatRupees(m.dailyAllowancePaise ?? 0)}
                  sub={`${(m.subsidyPercentageBp ?? 0) / 100}% subsidised`}
                />
                <Stat
                  label="Used today"
                  value={formatRupees(m.usedTodayPaise ?? 0)}
                  sub={`${m.ordersToday ?? 0} corporate ${m.ordersToday === 1 ? "order" : "orders"}`}
                />
                <Stat
                  label="Left today"
                  value={formatRupees(m.remainingAllowancePaise ?? 0)}
                  sub="Resets at midnight IST"
                />
              </div>
              <ul className="mt-6 space-y-3 text-sm text-ink-soft">
                <li className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" /> Allowance applies on weekday lunches between 11am and 3pm IST.</li>
                <li className="flex items-start gap-2"><UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0" /> Pick any restaurant at checkout; the corporate share is deducted automatically.</li>
                <li className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0" /> Any overage is paid from your BiteBox Credits.</li>
                <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {m.dropPointName ? `Delivery is coordinated through ${m.dropPointName}.` : "Delivery goes to your saved address."}</li>
                <li className="flex items-start gap-2"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0" /> Unbilled company balance: {formatRupees(m.unbilledBalancePaise ?? 0)} · invoiced monthly with GST.</li>
              </ul>
            </section>
          </>
        ) : (
          <section className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h2 className="h-section">Lunch, without the reimbursement chase.</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
                Companies set a daily per-employee allowance and a monthly credit limit. Employees order
                from any kitchen in the network; the company is billed once a month by cost centre, with
                food and platform fees on separate SAC codes.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  ["Enrol", "Your workplace admin adds your email to the company account."],
                  ["Order", "Pick lunch between 11am and 3pm on weekdays and pay only the overage."],
                  ["Reconcile", "Finance downloads one GST invoice, split by cost centre."],
                ].map(([title, body], i) => (
                  <div key={title}>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">0{i + 1}</p>
                    <p className="mt-2 font-medium text-ink">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/support" className="btn btn-primary">Talk to our corporate team</Link>
                {!isSignedIn && <Link href="/sign-in?redirect_url=/corporate" className="btn btn-secondary">Sign in</Link>}
              </div>
            </div>
            <aside className="rounded-3xl border border-line bg-subtle p-7">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">What&apos;s included</p>
              <ul className="mt-4 space-y-3 text-sm text-ink-soft">
                {[
                  "Per-employee daily allowance with subsidy controls",
                  "Monthly credit limit and unbilled balance tracking",
                  "One GST invoice by cost centre (SAC 996331 / 998596)",
                  "Same delivery network, offers and tracking as personal orders",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" /> {line}
                  </li>
                ))}
              </ul>
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}

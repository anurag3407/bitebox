"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandHeart, HeartHandshake, ReceiptText, UtensilsCrossed, Wallet } from "lucide-react";
import { EmptyState, PageSpinner, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const AMOUNTS = [1000, 5000, 10000, 25000];

export default function DonatePage() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const [amountPaise, setAmountPaise] = useState(5000);
  const [giving, setGiving] = useState(false);
  const donations = useQuery({ queryKey: ["donations"], queryFn: () => api.getDonations(), enabled: isLoaded && isSignedIn });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet(), enabled: isLoaded && isSignedIn });
  const balance = wallet.data?.account.balancePaise ?? 0;
  const insufficient = amountPaise > balance;

  const give = async () => {
    if (insufficient) return;
    setGiving(true);
    try {
      const result = await api.giveDonation(amountPaise);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["donations"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      toast(`${formatRupees(result.donation.amountPaise)} donated. Receipt ${result.donation.receiptCode}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setGiving(false);
    }
  };

  if (!isLoaded) return <PageSpinner />;

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <HeartHandshake className="h-3.5 w-3.5" /> BiteBox Foundation
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                A meal for
                <br />
                someone who needs one.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                Your BiteBox Credits fund hot meals at community kitchens. Every ₹50 covers one
                plate; receipts are recorded in your account.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
              <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {formatRupees(balance)} credits</span>
              <span className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> ₹50 = 1 meal</span>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        {!isSignedIn ? (
          <div className="mt-10">
            <EmptyState
              icon={<HandHeart />}
              title="Sign in to donate"
              body="Donations are paid from your BiteBox Credits and appear as receipts in your account."
              action={<Link href="/sign-in?redirect_url=/donate" className="btn btn-primary">Sign in</Link>}
            />
          </div>
        ) : (
          <section className="mt-10 grid gap-10 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <h2 className="h-section">Give a meal</h2>
              <p className="mt-1 text-sm text-ink-muted">Pick an amount. 100% is parked for the community kitchen fund.</p>

              <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Donation amount">
                {AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    role="radio"
                    aria-checked={amountPaise === amount}
                    onClick={() => setAmountPaise(amount)}
                    className={`chip h-12 px-6 text-base tabular ${amountPaise === amount ? "chip-active" : ""}`}
                  >
                    {formatRupees(amount)}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-line bg-white p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Your donation</span>
                  <span className="text-lg font-semibold text-ink tabular">{formatRupees(amountPaise)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Meals funded</span>
                  <span className="font-medium text-ink tabular">{Math.round(amountPaise / 5000)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Paid from</span>
                  <span className="font-medium text-ink">{formatRupees(balance)} credits</span>
                </div>
              </div>

              <button className="btn btn-primary btn-lg btn-block mt-5" disabled={giving || insufficient} onClick={give}>
                {giving ? <Spinner /> : <HandHeart className="h-4 w-4" />}
                {giving ? "Donating…" : insufficient ? "Not enough credits" : `Donate ${formatRupees(amountPaise)}`}
              </button>
              {insufficient && (
                <p className="mt-2 text-center text-xs text-ink-muted">
                  Need {formatRupees(amountPaise - balance)} more ·{" "}
                  <Link href="/account?tab=wallet" className="underline underline-offset-4 hover:text-ink">add credits</Link>
                  {" · "}
                  <Link href="/gift-cards" className="underline underline-offset-4 hover:text-ink">redeem a gift card</Link>
                </p>
              )}
            </div>

            <aside className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Given by you" value={formatRupees(donations.data?.totalPaise ?? 0)} sub="Lifetime" />
                <Stat label="Receipts" value={String(donations.data?.donations.length ?? 0)} sub="Last 30 shown" />
              </div>
              <div className="rounded-3xl border border-line p-6">
                <p className="text-sm font-semibold text-ink">How it works</p>
                <ol className="mt-3 space-y-3 text-sm text-ink-soft">
                  <li><span className="font-medium text-ink">1.</span> Credits leave your wallet and sit in a donations payable fund.</li>
                  <li><span className="font-medium text-ink">2.</span> The foundation disburses the fund to partner community kitchens.</li>
                  <li><span className="font-medium text-ink">3.</span> Every donation gets a receipt code in your history below.</li>
                </ol>
              </div>
            </aside>
          </section>
        )}

        {isSignedIn && (
          <section className="mt-12">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <ReceiptText className="h-4 w-4" /> Your donations
            </h2>
            {donations.isPending ? (
              <div className="mt-4 skeleton h-24" />
            ) : (donations.data?.donations.length ?? 0) === 0 ? (
              <p className="notice mt-4">No donations yet. Your first receipt will appear here.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {donations.data!.donations.map((donation) => (
                  <article key={donation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
                    <div>
                      <p className="font-medium text-ink">{formatRupees(donation.amountPaise)} to the community kitchen fund</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">{donation.receiptCode}</p>
                    </div>
                    <span className="badge badge-success">paid</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

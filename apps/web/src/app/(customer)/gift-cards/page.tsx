"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Gift, Mail, Sparkles, Ticket, Wallet } from "lucide-react";
import { EmptyState, PageSpinner, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const AMOUNTS = [10000, 25000, 50000, 100000];

const STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: "Active", tone: "badge-success" },
  REDEEMED: { label: "Redeemed", tone: "badge-neutral" },
  EXPIRED: { label: "Expired", tone: "badge-warn" },
  CANCELLED: { label: "Cancelled", tone: "badge-danger" },
};

export default function GiftCardsPage() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const cards = useQuery({ queryKey: ["gift-cards"], queryFn: () => api.getGiftCards(), enabled: isLoaded && isSignedIn });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet(), enabled: isLoaded && isSignedIn });
  const [amountPaise, setAmountPaise] = useState(50000);
  const [recipientName, setRecipientName] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [message, setMessage] = useState("");
  const [buying, setBuying] = useState(false);
  const [issued, setIssued] = useState<{ code: string; amountPaise: number } | null>(null);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState<number | null>(null);
  const balance = wallet.data?.account.balancePaise ?? 0;
  const insufficient = amountPaise > balance;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Gift card code copied", "success");
    } catch {
      toast("Copy the code manually", "error");
    }
  };

  const buy = async () => {
    if (recipientName.trim().length < 2) {
      toast("Add the recipient's name", "error");
      return;
    }
    setBuying(true);
    try {
      const result = await api.purchaseGiftCard({
        amountPaise,
        recipientName: recipientName.trim(),
        recipientContact: recipientContact.trim() || undefined,
        message: message.trim() || undefined,
      });
      setIssued({ code: result.card.code, amountPaise: result.card.amountPaise });
      setRecipientName("");
      setRecipientContact("");
      setMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gift-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      toast("Gift card ready to share", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBuying(false);
    }
  };

  const redeem = async () => {
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      const result = await api.redeemGiftCard(code.trim());
      setRedeemed(result.balancePaise);
      setCode("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gift-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      toast(`${formatRupees(result.card.amountPaise)} added to your credits`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRedeeming(false);
    }
  };

  if (!isLoaded) return <PageSpinner />;

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <Gift className="h-3.5 w-3.5" /> BiteBox Gift
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Give lunch,
                <br />
                not another mug.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                Send BiteBox Credits for a birthday, a thank-you or a long week. They choose the food;
                you choose the amount. Codes are valid for a year.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
              <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {formatRupees(balance)} credits</span>
              <span className="flex items-center gap-2"><Ticket className="h-4 w-4" /> ₹100 – ₹10,000</span>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        {!isSignedIn ? (
          <div className="mt-10">
            <EmptyState
              icon={<Gift />}
              title="Sign in to send or redeem a gift card"
              body="Gift cards are paid from your BiteBox Credits and redeemed into the recipient's wallet."
              action={<Link href="/sign-in?redirect_url=/gift-cards" className="btn btn-primary">Sign in</Link>}
            />
          </div>
        ) : (
          <>
            <section className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <h2 className="h-section">Send a gift card</h2>
                <p className="mt-1 text-sm text-ink-muted">Pick an amount, add a note, share the code.</p>

                <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Gift card amount">
                  {AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      role="radio"
                      aria-checked={amountPaise === amount}
                      onClick={() => setAmountPaise(amount)}
                      className={`chip h-11 px-5 tabular ${amountPaise === amount ? "chip-active" : ""}`}
                    >
                      {formatRupees(amount)}
                    </button>
                  ))}
                </div>

                <label className="mt-5 block">
                  <span className="label">Recipient name</span>
                  <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Priya" maxLength={80} />
                </label>
                <label className="mt-4 block">
                  <span className="label">Phone or email (optional)</span>
                  <input className="input" value={recipientContact} onChange={(e) => setRecipientContact(e.target.value)} placeholder="priya@example.com" maxLength={120} />
                </label>
                <label className="mt-4 block">
                  <span className="label">Message (optional)</span>
                  <textarea className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Lunch is on me this week." maxLength={200} />
                </label>

                <button className="btn btn-primary btn-block mt-5" disabled={buying || insufficient} onClick={buy}>
                  {buying ? <Spinner /> : <Gift className="h-4 w-4" />}
                  {buying ? "Issuing…" : insufficient ? "Not enough credits" : `Buy ${formatRupees(amountPaise)} gift card`}
                </button>
                {insufficient && (
                  <p className="mt-2 text-center text-xs text-ink-muted">
                    Need {formatRupees(amountPaise - balance)} more ·{" "}
                    <Link href="/account?tab=wallet" className="underline underline-offset-4 hover:text-ink">add credits</Link>
                  </p>
                )}

                {issued && (
                  <div className="mt-5 rounded-2xl border border-success/30 bg-success/5 p-5">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Check className="h-4 w-4 text-success" /> Gift card issued for {formatRupees(issued.amountPaise)}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
                      <code className="font-mono text-sm font-semibold tracking-wider text-ink">{issued.code}</code>
                      <button className="btn btn-secondary btn-sm" onClick={() => copy(issued.code)}>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">Share this code with the recipient. It can be redeemed once, for a year.</p>
                  </div>
                )}
              </div>

              <aside className="space-y-5">
                <div className="rounded-3xl border border-line bg-subtle p-6">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Mail className="h-4 w-4" /> Redeem a gift card
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">Credits land in your wallet instantly.</p>
                  <label className="mt-4 block">
                    <span className="label">Gift card code</span>
                    <input
                      className="input font-mono uppercase tracking-wider"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="BXG-XXXX-XXXX"
                      maxLength={20}
                    />
                  </label>
                  <button className="btn btn-primary btn-block mt-4" disabled={redeeming || code.trim().length < 4} onClick={redeem}>
                    {redeeming ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                    {redeeming ? "Redeeming…" : "Add to my credits"}
                  </button>
                  {redeemed !== null && (
                    <p className="notice notice-success mt-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" /> Redeemed. Your balance is now {formatRupees(redeemed)}.
                    </p>
                  )}
                </div>
                <div className="rounded-3xl border border-line p-6">
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Credits" value={formatRupees(balance)} sub="Wallet balance" />
                    <Stat label="Sent" value={String(cards.data?.cards.length ?? 0)} sub="Lifetime gift cards" />
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-ink-muted">
                    Gift cards are prepaid. Unredeemed balances sit in a separate liability until someone
                    uses the code, then move into that person&apos;s BiteBox Credits.
                  </p>
                </div>
              </aside>
            </section>

            <section className="mt-12">
              <h2 className="h-section">Your gift cards</h2>
              {cards.isPending ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="skeleton h-32" />
                  <div className="skeleton h-32" />
                </div>
              ) : (cards.data?.cards.length ?? 0) === 0 ? (
                <p className="notice mt-4">No gift cards sent yet. Your first one will appear here with its code.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {cards.data!.cards.map((card) => {
                    const status = STATUS[card.status] ?? { label: card.status, tone: "badge-neutral" };
                    return (
                      <article key={card.id} className="rounded-2xl border border-line bg-white p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">To {card.recipientName}</p>
                            <p className="mt-1 text-xl font-semibold tracking-tight text-ink tabular">{formatRupees(card.amountPaise)}</p>
                          </div>
                          <span className={`badge ${status.tone}`}>{status.label}</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-subtle px-3 py-2">
                          <code className="font-mono text-xs font-semibold tracking-wider text-ink">{card.code}</code>
                          <button className="text-ink-muted transition-colors hover:text-ink" aria-label="Copy gift card code" onClick={() => copy(card.code)}>
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        {card.message && <p className="mt-3 text-sm italic text-ink-muted">“{card.message}”</p>}
                        <p className="mt-3 text-xs text-ink-muted">
                          {card.status === "REDEEMED" ? "Redeemed" : "Valid until"}{" "}
                          {new Date(card.redeemedAt ?? card.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

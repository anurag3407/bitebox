"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarDays,
  ChevronRight,
  Copy,
  Crown,
  Gift,
  Heart,
  Home,
  MapPin,
  Plus,
  Receipt,
  Share2,
  ShieldPlus,
  Star,
  Trash2,
  User,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { AddressDto } from "@startup/contracts";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { AddressForm } from "@/components/location/address-form";
import { LocationSheet } from "@/components/location/location-sheet";
import { ActionDialog, Modal } from "@/components/ui/modal";
import { Field, PhoneInput, Toggle } from "@/components/ui/field";
import { EmptyState, PageSpinner, SafeImage, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "@/features/pwa/push";
import { errorMessage, useApi, useMe } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { STATE_LABELS, formatDateTime, formatRupees } from "@/lib/format";
import { useI18n } from "@/features/i18n/use-i18n";
import type { MessageKey } from "@/features/i18n/messages";

type Tab = "orders" | "dining" | "wallet" | "gold" | "rewards" | "addresses" | "favorites" | "profile";
const TABS: Array<{ id: Tab; labelKey: MessageKey }> = [
  { id: "orders", labelKey: "account.tab.orders" },
  { id: "dining", labelKey: "account.tab.dining" },
  { id: "wallet", labelKey: "account.tab.wallet" },
  { id: "gold", labelKey: "account.tab.gold" },
  { id: "rewards", labelKey: "account.tab.rewards" },
  { id: "addresses", labelKey: "account.tab.addresses" },
  { id: "favorites", labelKey: "account.tab.favorites" },
  { id: "profile", labelKey: "account.tab.profile" },
];

function stateBadge(state: string): string {
  if (state === "DELIVERED") return "badge-neutral";
  if (state === "CANCELLED" || state === "DELIVERY_FAILED") return "badge-danger";
  return "badge-success";
}

function OrdersTab() {
  const api = useApi();
  const orders = useInfiniteQuery({
    queryKey: ["orders"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.getCustomerOrders({ before: pageParam, limit: 15 }),
    getNextPageParam: (last) => (last.length === 15 ? last[last.length - 1]!.createdAt : undefined),
  });
  const list = orders.data?.pages.flat() ?? [];

  if (orders.isPending) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<Receipt />}
        title="No orders yet"
        body="When you place an order, it'll show up here."
        action={
          <Link href="/" className="btn btn-primary">
            Find something to eat
          </Link>
        }
      />
    );
  }
  return (
    <div>
      <ul className="rows">
        {list.map((o) => (
          <li key={o.orderId}>
            <Link href={`/orders/${o.orderId}`} className="group flex items-center gap-5 py-5">
              <SafeImage src={o.restaurantImageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="truncate font-medium text-ink">{o.restaurantName}</p>
                  <span className={`badge ${stateBadge(o.fulfillmentState)}`}>{STATE_LABELS[o.fulfillmentState]}</span>
                </div>
                <p className="mt-1 truncate text-sm text-ink-muted">{o.itemsPreview}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                  <span>{formatDateTime(o.createdAt)}</span>
                  <span>·</span>
                  <span className="text-ink tabular">{formatRupees(o.payablePaise)}</span>
                  {o.rating && (
                    <span className="inline-flex items-center gap-0.5 text-ink">
                      · <Star className="h-3 w-3 fill-ink" /> {o.rating}
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      {orders.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <button onClick={() => orders.fetchNextPage()} disabled={orders.isFetchingNextPage} className="btn btn-outline">
            {orders.isFetchingNextPage ? "Loading…" : "Load older orders"}
          </button>
        </div>
      )}
    </div>
  );
}

function WalletTab() {
  const api = useApi();
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet() });
  if (wallet.isPending) return <div className="skeleton h-40" />;
  const account = wallet.data?.account;
  const kindLabel: Record<string, string> = {
    REFERRAL_BONUS: "Referral bonus",
    REFERRAL_WELCOME: "Welcome reward",
    REFUND_CREDIT: "Refund",
    CASHBACK: "Cashback",
    GOODWILL: "Goodwill credit",
    ORDER_PAYMENT: "Order payment",
    REVERSAL: "Reversal",
    ADMIN_ADJUSTMENT: "Adjustment",
  };
  return (
    <div>
      <div className="relative overflow-hidden rounded-[28px] bg-ink p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-10 h-44 w-44 rounded-full bg-white/[0.04]" aria-hidden />
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-white/60">
              <Wallet className="h-3.5 w-3.5" /> BiteBox Credits
            </p>
            <p className="mt-4 text-4xl font-semibold tracking-tight tabular sm:text-5xl">{formatRupees(account?.balancePaise ?? 0)}</p>
            <p className="mt-2 text-sm text-white/60">Usable on any order. Never expires.</p>
          </div>
          <Link href="/account?tab=rewards" className="btn btn-sm border border-white/20 bg-white/10 text-white hover:bg-white/15">
            <Gift className="h-4 w-4" /> Earn more
          </Link>
        </div>
        <div className="mt-8 flex gap-8 border-t border-white/10 pt-5 text-sm">
          <span>
            <span className="block text-white/50">Earned</span>
            <span className="mt-1 block font-medium tabular">{formatRupees(account?.lifetimeCreditedPaise ?? 0)}</span>
          </span>
          <span>
            <span className="block text-white/50">Spent</span>
            <span className="mt-1 block font-medium tabular">{formatRupees(account?.lifetimeSpentPaise ?? 0)}</span>
          </span>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="h-section">Activity</h2>
        <Link href="/support" className="text-sm text-ink-muted hover:text-ink">
          Something wrong?
        </Link>
      </div>
      {(wallet.data?.transactions.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="No credits yet"
          body="Refer a friend, get an instant refund or accept a goodwill credit — they all land here."
          action={
            <Link href="/account?tab=rewards" className="btn btn-primary">
              Refer a friend
            </Link>
          }
        />
      ) : (
        <ul className="rows mt-2">
          {wallet.data!.transactions.map((t) => (
            <li key={t.id} className="flex items-center gap-4 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-soft">
                {t.direction === "CREDIT" ? <Gift className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{kindLabel[t.kind] ?? t.kind}</p>
                <p className="truncate text-xs text-ink-muted">{t.description}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(t.createdAt)}</p>
              </div>
              <span className={`shrink-0 text-sm font-semibold tabular ${t.direction === "CREDIT" ? "text-success" : "text-ink"}`}>
                {t.direction === "CREDIT" ? "+" : "−"}
                {formatRupees(t.amountPaise)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoldTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const membership = useQuery({ queryKey: ["membership"], queryFn: () => api.getMembership() });
  const [buying, setBuying] = useState(false);
  if (membership.isPending) return <div className="skeleton h-40" />;
  const data = membership.data;
  if (!data) return null;
  const active = data.active;
  const plan = data.plans.find((p) => p.code === "GOLD");
  const threshold = plan?.benefits.freeDeliveryAbovePaise ?? 19_900;
  const progress = Math.min(1, data.deliveredOrders / 5);

  const buyGold = async () => {
    if (!plan || buying) return;
    setBuying(true);
    try {
      const purchase = await api.purchaseMembership(plan.id);
      let paymentId: string | null = null;
      let signature: string | null = null;
      if (purchase.simulatedPayment) {
        paymentId = `pay_sim_gold_${Date.now()}`;
        signature = "mock_valid_sig_verification_token";
      } else {
        const result = await openRazorpayCheckout({
          keyId: purchase.razorpayKeyId,
          razorpayOrderId: purchase.razorpayOrderId,
          amountPaise: purchase.amountPaise,
          orderNumber: "BiteBox Gold",
          prefill: { name: me.data?.name, email: me.data?.email ?? undefined, contact: me.data?.phone ?? undefined },
        });
        if (!result) {
          toast("Payment cancelled", "info");
          return;
        }
        paymentId = result.razorpay_payment_id;
        signature = result.razorpay_signature;
      }
      if (!paymentId || !signature) throw new Error("Payment did not complete.");
      const verified = await api.verifyMembershipPayment({
        purchaseId: purchase.purchaseId,
        razorpayOrderId: purchase.razorpayOrderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      });
      await queryClient.invalidateQueries({ queryKey: ["membership"] });
      toast(
        verified.membership
          ? `Gold active until ${new Date(verified.membership.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`
          : "Payment received. Gold will activate as soon as the bank confirms.",
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[28px] bg-ink p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 right-16 h-40 w-40 rounded-full bg-white/[0.04]" aria-hidden />
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
          <Crown className="h-3.5 w-3.5" /> BiteBox GOLD
        </p>
        <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {active ? "You're a Gold member." : "Five deliveries to Gold."}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/60">
          {active
            ? `Free delivery on orders over ${formatRupees(threshold)} until ${new Date(active.endsAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}. Priority support included.`
            : `Complete ${data.ordersToGold} more delivered ${data.ordersToGold === 1 ? "order" : "orders"} to unlock 30 days of free delivery on food orders over ${formatRupees(threshold)}.`}
        </p>
        {!active && (
          <div className="mt-7 max-w-sm">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-white/50 tabular">{data.deliveredOrders} of 5 delivered orders</p>
          </div>
        )}
        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-2">
          <span>
            <span className="block text-white/45">Cashback earned</span>
            <span className="mt-1 block font-medium tabular">{formatRupees(data.cashbackEarnedPaise)}</span>
          </span>
          <span>
            <span className="block text-white/45">Delivery savings</span>
            <span className="mt-1 block font-medium">{active ? "Free over " + formatRupees(threshold) : "Locked"}</span>
          </span>
        </div>
        {plan && plan.pricePaise > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-white/10 pt-5">
            <button
              onClick={buyGold}
              disabled={buying}
              className="btn bg-white text-ink hover:bg-white/90 disabled:opacity-50"
            >
              {buying ? <Spinner /> : <Crown className="h-4 w-4" />}
              {active ? "Extend Gold" : "Join Gold"} · {formatRupees(plan.pricePaise)}
            </button>
            <p className="text-xs text-white/50">
              {active ? "Adds 30 days from your current end date." : "30 days. Pay securely with Razorpay."}
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 className="h-section">Gold perks</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["Free delivery", `On food orders above ${formatRupees(threshold)}, every time.`],
            ["Priority support", "Your conversations jump the support queue."],
            ["Gold badge", "Visible on your account and reviews."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-3xl border border-line p-5">
              <Crown className="h-5 w-5 text-ink" />
              <p className="mt-3 text-sm font-medium text-ink">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-3xl bg-subtle p-6">
        <h2 className="text-base font-semibold text-ink">Every order earns 2% back</h2>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-muted">
          We credit 2% of your food subtotal to BiteBox Credits when an order is delivered — up to ₹50 per order. It stacks with
          referrals and refunds.
        </p>
        <Link href="/account?tab=wallet" className="btn btn-outline mt-4">
          View credits
        </Link>
      </div>

      {!active && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-line p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-medium text-ink">Keep going</p>
            <p className="mt-1 text-sm text-ink-muted">Your next order also earns credits toward Gold.</p>
          </div>
          <Link href="/" className="btn btn-primary">
            Order something
          </Link>
        </div>
      )}
    </div>
  );
}

function RewardsTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const referrals = useQuery({ queryKey: ["referrals"], queryFn: () => api.getReferrals() });
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);

  if (referrals.isPending) return <div className="skeleton h-40" />;
  const data = referrals.data;
  if (!data) return null;

  const share = async () => {
    const text = `Order your favourites on BiteBox — use my code ${data.code} and we both get credits.`;
    try {
      if (navigator.share) await navigator.share({ title: "BiteBox", text, url: data.shareUrl });
      else {
        await navigator.clipboard.writeText(`${text} ${data.shareUrl}`);
        toast("Invite link copied", "success");
      }
    } catch {
      // User dismissed the share sheet
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(data.code);
    toast("Referral code copied", "success");
  };

  return (
    <div className="space-y-10">
      <div className="rounded-[28px] border border-line p-7 sm:p-9">
        <p className="eyebrow">Give ₹{data.refereeRewardPaise / 100}, get ₹{data.referrerRewardPaise / 100}</p>
        <h2 className="mt-3 max-w-md text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Your friends eat. You both earn BiteBox Credits.
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-muted">
          Share your code. When your friend’s first order is delivered, {formatRupees(data.refereeRewardPaise)} lands in their credits and{" "}
          {formatRupees(data.referrerRewardPaise)} in yours.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button onClick={copy} className="flex h-14 min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl border border-dashed border-line-strong px-5 text-left hover:border-ink">
            <span>
              <span className="block text-[11px] uppercase tracking-[0.08em] text-ink-muted">Your code</span>
              <span className="mt-0.5 block text-xl font-semibold tracking-[0.12em] text-ink">{data.code}</span>
            </span>
            <Copy className="h-4 w-4 shrink-0 text-ink-muted" />
          </button>
          <button onClick={share} className="btn btn-primary btn-lg sm:w-auto">
            <Share2 className="h-4 w-4" /> Invite a friend
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Invited" value={data.stats.invited} />
        <Stat label="Pending" value={data.stats.pending} />
        <Stat label="Earned" value={formatRupees(data.stats.earnedPaise)} tone="good" />
      </div>

      <div>
        <h2 className="h-section">Have a friend’s code?</h2>
        <p className="mt-1 text-sm text-ink-muted">Redeem it before your first order.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setApplying(true);
            try {
              await api.applyReferralCode(code);
              setCode("");
              await queryClient.invalidateQueries({ queryKey: ["referrals"] });
              toast("Referral applied. Rewards unlock after your first delivery.", "success");
            } catch (err) {
              toast(errorMessage(err), "error");
            } finally {
              setApplying(false);
            }
          }}
          className="mt-4 flex max-w-md gap-2"
        >
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BX…" className="input uppercase" maxLength={12} />
          <button disabled={code.length < 6 || applying} className="btn btn-outline">
            {applying ? <Spinner /> : "Apply"}
          </button>
        </form>
      </div>

      <div>
        <h2 className="h-section">Your invites</h2>
        {data.referrals.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No invites yet. Share your code to get started.</p>
        ) : (
          <ul className="rows mt-3">
            {data.referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-medium text-ink">{r.refereeName}</p>
                  <p className="text-xs text-ink-muted">{formatDateTime(r.createdAt)}</p>
                </div>
                <span className={`badge ${r.status === "REWARDED" ? "badge-success" : r.status === "PENDING" ? "badge-warn" : "badge-neutral"}`}>
                  {r.status === "REWARDED" ? `+${formatRupees(r.referrerRewardPaise)}` : r.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DiningTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const reservations = useQuery({ queryKey: ["dining-reservations"], queryFn: () => api.getMyDiningReservations() });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const upcoming = (reservations.data ?? []).filter((r) => r.date >= today && r.status !== "CANCELLED");
  const past = (reservations.data ?? []).filter((r) => r.date < today || r.status === "CANCELLED");

  if (reservations.isPending) return <div className="skeleton h-40" />;

  const card = (r: NonNullable<typeof reservations.data>[number], isPast: boolean) => (
    <li key={r.id} className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-subtle">
            <span className="text-[10px] uppercase text-ink-muted">
              {new Date(`${r.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}
            </span>
            <span className="text-base font-semibold leading-none text-ink">
              {new Date(`${r.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" })}
            </span>
          </span>
          <div>
            <p className="font-medium text-ink">{r.restaurantName}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {new Date(`${r.date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "Asia/Kolkata",
              })}{" "}
              · {r.slot} · {r.partySize} guests
            </p>
            <p className="mt-1 text-xs text-ink-muted">Code {r.confirmationCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${r.status === "CANCELLED" ? "badge-danger" : r.status === "COMPLETED" ? "badge-neutral" : "badge-success"}`}>
            {r.status.toLowerCase().replace("_", " ")}
          </span>
          {!isPast && r.status === "CONFIRMED" && (
            <button
              onClick={async () => {
                try {
                  await api.cancelDiningReservation(r.id);
                  await queryClient.invalidateQueries({ queryKey: ["dining-reservations"] });
                  toast("Reservation cancelled", "success");
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
              className="text-sm font-medium text-danger"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </li>
  );

  if (!reservations.data?.length) {
    return (
      <EmptyState
        icon={<UtensilsCrossed />}
        title="No table bookings yet"
        body="Reserve a table at a restaurant near you — it's free and instant."
        action={
          <Link href="/dining" className="btn btn-primary">
            Explore dining
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="h-section">Upcoming</h2>
        <Link href="/dining" className="btn btn-ghost btn-sm">
          <CalendarDays className="h-4 w-4" /> Book another
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No upcoming reservations.</p>
      ) : (
        <ul className="rows mt-1">{upcoming.map((r) => card(r, false))}</ul>
      )}
      {past.length > 0 && (
        <>
          <h2 className="h-section mt-12">Past & cancelled</h2>
          <ul className="rows mt-1 opacity-70">{past.map((r) => card(r, true))}</ul>
        </>
      )}
    </div>
  );
}

function AddressesTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => api.getAddresses() });
  const [editing, setEditing] = useState<AddressDto | null>(null);
  const [deleting, setDeleting] = useState<AddressDto | null>(null);
  const [adding, setAdding] = useState(false);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      toast(ok, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
      throw err;
    }
  };

  if (addresses.isPending) return <div className="skeleton h-40" />;

  return (
    <div>
      <ul className="rows">
        {addresses.data?.map((a) => (
          <li key={a.id} className="flex items-start gap-5 py-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-soft">
              {a.label === "Work" ? <Briefcase className="h-4 w-4" /> : <Home className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-ink">
                {a.label} {a.isDefault && <span className="badge badge-neutral">Default</span>}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {a.building}, {a.street}
              </p>
              {a.landmark && <p className="text-sm text-ink-muted">Near {a.landmark}</p>}
              <div className="mt-3 flex gap-5 text-sm">
                <button onClick={() => setEditing(a)} className="link">
                  Edit
                </button>
                {!a.isDefault && (
                  <button onClick={() => act(() => api.setDefaultAddress(a.id), "Default address updated").catch(() => undefined)} className="link">
                    Make default
                  </button>
                )}
                <button onClick={() => setDeleting(a)} className="font-medium text-danger">
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {addresses.data?.length === 0 && <EmptyState icon={<MapPin />} title="No saved addresses" body="Save your home or office for faster checkout." />}
      <button onClick={() => setAdding(true)} className="btn btn-outline mt-4">
        <Plus className="h-4 w-4" /> Add address
      </button>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit address">
        {editing && (
          <AddressForm
            location={{ latitude: editing.latitude, longitude: editing.longitude }}
            initial={editing}
            onSaved={() => {
              setEditing(null);
              toast("Address updated", "success");
            }}
          />
        )}
      </Modal>
      <ActionDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        description={deleting ? `${deleting.label} · ${deleting.building}, ${deleting.street}` : undefined}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => act(() => api.deleteAddress(deleting!.id), "Address deleted")}
      />
      <LocationSheet open={adding} onClose={() => setAdding(false)} requireSavedAddress />
    </div>
  );
}

function FavoritesTab() {
  const api = useApi();
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: () => api.getFavorites() });
  if (favorites.isPending) return <div className="skeleton h-40" />;
  if (!favorites.data?.length) return <EmptyState icon={<Heart />} title="No favourites yet" body="Tap the heart on any restaurant to keep it here." />;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.data.map((r) => (
        <RestaurantCard key={r.id} restaurant={r} />
      ))}
    </div>
  );
}

function SettingsBlock({ title, body, children }: { title: string; body?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 py-10 first:pt-0 md:grid-cols-[240px_1fr] md:gap-12">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {body && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function PreferenceToggles() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["notification-preferences"], queryFn: () => api.getNotificationPreferences() });
  const [busy, setBusy] = useState<string | null>(null);

  const rows: Array<{ key: keyof NonNullable<typeof prefs.data>; label: string; hint: string }> = [
    { key: "orderUpdates", label: "Order updates", hint: "Accepted, picked up, arriving, delivered" },
    { key: "offers", label: "Offers & deals", hint: "Coupons and restaurant offers" },
    { key: "referrals", label: "Referral updates", hint: "When a friend joins or rewards unlock" },
    { key: "newsletter", label: "BiteBox newsletter", hint: "New restaurants and city guides" },
    { key: "smsEnabled", label: "SMS", hint: "Delivery OTPs are always sent" },
    { key: "emailEnabled", label: "Email", hint: "Receipts and account updates" },
    { key: "whatsappEnabled", label: "WhatsApp", hint: "Order updates on WhatsApp" },
  ];

  const update = async (key: keyof NonNullable<typeof prefs.data>, label: string, value: boolean) => {
    setBusy(key);
    try {
      await api.updateNotificationPreferences({ [key]: value });
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast(`${label} ${value ? "on" : "off"}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  if (prefs.isPending) return <div className="skeleton mt-6 h-28 max-w-md" />;
  if (!prefs.data) return null;
  return (
    <div className="mt-6 max-w-md divide-y divide-line rounded-2xl border border-line px-5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-4 py-4">
          <span className="text-sm text-ink">
            {r.label}
            <span className="mt-0.5 block text-xs text-ink-muted">{r.hint}</span>
          </span>
          <Toggle
            label={r.label}
            checked={!!prefs.data![r.key]}
            disabled={busy === r.key}
            onChange={(next) => update(r.key, r.label, next)}
          />
        </div>
      ))}
    </div>
  );
}

function FoodPreferences() {
  const [vegOnly, setVegOnly] = useState(false);
  useEffect(() => {
    setVegOnly(localStorage.getItem("bitebox_veg_only") === "true");
  }, []);
  return (
    <SettingsBlock
      title="Food preferences"
      body="Veg mode only shows vegetarian dishes and restaurants in your home and search feeds."
    >
      <div className="flex max-w-md items-center justify-between gap-4">
        <span className="text-[15px] text-ink">Veg mode</span>
        <Toggle
          label="Veg mode"
          checked={vegOnly}
          onChange={(next) => {
            setVegOnly(next);
            localStorage.setItem("bitebox_veg_only", String(next));
          }}
        />
      </div>
    </SettingsBlock>
  );
}

function SafetySettings() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const contacts = useQuery({ queryKey: ["safety-contacts"], queryFn: () => api.getSafetyContacts() });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [primary, setPrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  const remove = async (id: string) => {
    try {
      await api.deleteSafetyContact(id);
      await queryClient.invalidateQueries({ queryKey: ["safety-contacts"] });
      toast("Trusted contact removed", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <SettingsBlock
      title="Safety"
      body="Trusted contacts are shown to our safety team if you ever raise an SOS during an order. They are never shared with restaurants or riders."
    >
      {contacts.isPending ? (
        <div className="skeleton h-24" />
      ) : contacts.data?.length ? (
        <ul className="rows max-w-md">
          {contacts.data.map((c) => (
            <li key={c.id} className="flex items-center gap-4 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-ink">
                {c.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {c.name} {c.isPrimary && <span className="badge badge-neutral">Primary</span>}
                </p>
                <p className="text-xs text-ink-muted">
                  {c.relationship ? `${c.relationship} · ` : ""}
                  {c.phone}
                </p>
              </div>
              <button onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`} className="btn btn-ghost btn-icon text-ink-muted hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No trusted contacts yet.</p>
      )}
      <button onClick={() => setAdding(true)} disabled={(contacts.data?.length ?? 0) >= 3} className="btn btn-outline mt-4">
        <ShieldPlus className="h-4 w-4" /> Add trusted contact
      </button>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a trusted contact"
        description="Up to 3 people our safety team can coordinate with."
        footer={
          <button
            disabled={saving || name.trim().length < 2 || phone.length !== 10}
            onClick={async () => {
              setSaving(true);
              try {
                await api.addSafetyContact({
                  name: name.trim(),
                  phone: `+91${phone}`,
                  relationship: relationship.trim() || undefined,
                  isPrimary: primary,
                });
                await queryClient.invalidateQueries({ queryKey: ["safety-contacts"] });
                setAdding(false);
                setName("");
                setPhone("");
                setRelationship("");
                setPrimary(false);
                toast("Trusted contact added", "success");
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setSaving(false);
              }
            }}
            className="btn btn-primary btn-block"
          >
            {saving && <Spinner />} Save contact
          </button>
        }
      >
        <div className="space-y-5">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="input" placeholder="e.g. Priya" />
          </Field>
          <Field label="Mobile number">
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="Relationship" hint="Optional — partner, parent, friend">
            <input value={relationship} onChange={(e) => setRelationship(e.target.value)} maxLength={30} className="input" />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-ink">Make primary contact</span>
            <Toggle label="Primary contact" checked={primary} onChange={setPrimary} />
          </div>
        </div>
      </Modal>
    </SettingsBlock>
  );
}

function ProfileTab() {
  const { language, setLanguage, t } = useI18n();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const config = useQuery({ queryKey: ["config"], queryFn: () => fetch("/api/v1/config").then((r) => r.json()).then((j) => j.data) });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);

  const changeLanguage = async (next: "en" | "hi") => {
    if (next === language) return;
    setLanguageBusy(true);
    try {
      await api.updateLanguage(next);
      setLanguage(next);
      toast(next === "hi" ? "भाषा हिन्दी में बदल गई" : "Language set to English", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLanguageBusy(false);
    }
  };

  useEffect(() => {
    if (me.data) {
      setName(me.data.name);
      setPhone(me.data.phone?.replace(/^\+91/, "") ?? "");
    }
  }, [me.data]);
  useEffect(() => {
    getPushSubscription()
      .then((s) => setPushOn(!!s))
      .catch(() => setPushOn(false));
  }, []);

  const vapid: string | null = config.data?.vapidPublicKey ?? null;
  const dirty = !!me.data && (name.trim() !== me.data.name || phone !== (me.data.phone?.replace(/^\+91/, "") ?? ""));

  return (
    <div className="rows">
      <SettingsBlock title={t("profile.language")} body={t("profile.languageHint")}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("profile.language")}>
          {([["en", t("profile.english")], ["hi", t("profile.hindi")]] as const).map(([code, label]) => (
            <button
              key={code}
              role="radio"
              aria-checked={language === code}
              disabled={languageBusy}
              onClick={() => changeLanguage(code)}
              className={`chip h-11 px-5 ${language === code ? "chip-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsBlock>

      <SettingsBlock title="Personal details" body="Used for your orders and receipts.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.updateMe({ name: name.trim(), phone: phone ? `+91${phone}` : undefined });
              await queryClient.invalidateQueries({ queryKey: ["me"] });
              toast("Profile updated", "success");
            } catch (err) {
              toast(errorMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
          className="max-w-md space-y-5"
        >
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="input" autoComplete="name" />
          </Field>
          <Field label="Mobile number">
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="Email">
            <input value={me.data?.email ?? ""} disabled className="input" />
          </Field>
          <button disabled={busy || !dirty} className="btn btn-primary">
            {busy && <Spinner />} Save changes
          </button>
        </form>
      </SettingsBlock>

      <SettingsBlock
        title="Notifications"
        body={
          !pushSupported()
            ? "Not supported in this browser. Add BiteBox to your home screen to get alerts."
            : !vapid
              ? "Notifications aren't configured on this server."
              : "Alerts when your order is accepted, picked up and delivered."
        }
      >
        {pushSupported() && vapid && pushOn !== null && (
          <div className="flex max-w-md items-center justify-between gap-4">
            <span className="text-[15px] text-ink">Order updates</span>
            <Toggle
              label="Order update notifications"
              checked={pushOn}
              onChange={async () => {
                try {
                  if (pushOn) {
                    await disablePush(api);
                    setPushOn(false);
                  } else {
                    const result = await enablePush(api, vapid);
                    if (result === "denied") toast("Notifications are blocked. Allow them in your browser settings.", "error");
                    setPushOn(result === "enabled");
                  }
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
            />
          </div>
        )}
        <PreferenceToggles />
      </SettingsBlock>

      <FoodPreferences />
      <SafetySettings />
      <PrivacyControls />
    </div>
  );
}

function PrivacyControls() {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    try {
      const res = await fetch("/api/v1/me/export", { headers: await api.authHeaders() });
      if (!res.ok) throw new Error("Could not prepare your data. Try again later.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking synchronously can cancel the download in Safari and Firefox
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <SettingsBlock
      title="Your data"
      body={
        <>
          Download a copy, or permanently delete your account. Invoices are kept for tax purposes without your personal details.{" "}
          <Link href="/legal/privacy" className="link">
            Privacy policy
          </Link>
        </>
      }
    >
      <div className="flex flex-wrap gap-3">
        <button onClick={download} className="btn btn-outline">
          Download my data
        </button>
        <button
          onClick={() => {
            setTyped("");
            setConfirming(true);
          }}
          className="btn btn-danger-ghost"
        >
          Delete account
        </button>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Delete your account?"
        description="This can't be undone. Your saved addresses, favourites and profile are erased."
        footer={
          <button
            disabled={typed !== "DELETE" || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.deleteAccount();
                await signOut();
                queryClient.clear();
                router.push("/");
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setBusy(false);
              }
            }}
            className="btn btn-danger btn-block"
          >
            {busy && <Spinner />} Permanently delete
          </button>
        }
      >
        <Field label="Type DELETE to confirm">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input" autoComplete="off" />
        </Field>
      </Modal>
    </SettingsBlock>
  );
}

function AccountContent() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const tab = (TABS.find((entry) => entry.id === params.get("tab"))?.id ?? "orders") as Tab;

  if (!isLoaded) return <PageSpinner />;
  if (!isSignedIn) {
    return (
      <EmptyState
        icon={<User />}
        title="Sign in to see your account"
        body="Your orders, addresses and favourites live here."
        action={
          <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/account?tab=${tab}`)}`} className="btn btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="page pb-16 pt-10 sm:pt-14">
      <header>
        <h1 className="h-page">{me.data ? `Hi, ${me.data.name.split(" ")[0]}` : "Account"}</h1>
        {me.data?.email && <p className="mt-1.5 text-sm text-ink-muted">{me.data.email}</p>}
      </header>
      <div role="tablist" aria-label="Account sections" className="tabs mt-10">
        {TABS.map((entry) => (
          <button key={entry.id} role="tab" aria-selected={tab === entry.id} onClick={() => router.replace(`/account?tab=${entry.id}`, { scroll: false })} className="tab">
            {t(entry.labelKey)}
          </button>
        ))}
      </div>
      <div className="pt-10" role="tabpanel">
        {tab === "orders" && <OrdersTab />}
        {tab === "dining" && <DiningTab />}
        {tab === "wallet" && <WalletTab />}
        {tab === "gold" && <GoldTab />}
        {tab === "rewards" && <RewardsTab />}
        {tab === "addresses" && <AddressesTab />}
        {tab === "favorites" && <FavoritesTab />}
        {tab === "profile" && <ProfileTab />}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AccountContent />
    </Suspense>
  );
}

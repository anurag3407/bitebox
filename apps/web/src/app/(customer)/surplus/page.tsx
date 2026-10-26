"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Leaf, MapPin, ShieldCheck, Star, Wallet } from "lucide-react";
import { EmptyState, PageSpinner, SafeImage, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { errorMessage } from "@/lib/api";

function windowLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${day} · ${s.toLocaleTimeString("en-IN", opts)} – ${e.toLocaleTimeString("en-IN", opts)}`;
}

export default function SurplusPage() {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);
  const bags = useQuery({ queryKey: ["surplus-bags"], queryFn: () => api.getSurplusBags(), refetchInterval: 30_000 });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet() });
  const balance = wallet.data?.account.balancePaise ?? 0;

  const buy = async (listingId: string, pricePaise: number) => {
    if (balance < pricePaise) {
      toast("Not enough BiteBox Credits. Earn credits with referrals or a delivered order.", "error");
      return;
    }
    setBuying(listingId);
    try {
      const result = await api.purchaseSurplusBag(listingId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["surplus-bags"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      toast("Rescue bag reserved. Show your pickup code at the counter.", "success");
      router.push(`/orders/${result.orderId}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <Leaf className="h-3.5 w-3.5" /> BiteBox Rescue
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Great food.
                <br />
                Half the price.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                Surprise bags of surplus food from your favourite kitchens. You save money, they waste less.
                Pickup only.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" /> {formatRupees(balance)} credits
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Fresh, sealed, ready
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        <div className="mt-8 flex items-baseline justify-between gap-4">
          <h2 className="h-section">Bags near you</h2>
          <Link href="/account?tab=wallet" className="text-sm font-medium text-ink-soft hover:text-ink">
            Add credits
          </Link>
        </div>

        {bags.isPending ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-80" />
            ))}
          </div>
        ) : bags.isError ? (
          <EmptyState icon={<Leaf />} title="Couldn't load rescue bags" body={errorMessage(bags.error)} />
        ) : bags.data?.length === 0 ? (
          <EmptyState
            icon={<Leaf />}
            title="No rescue bags right now"
            body="Kitchens list surprise bags near closing time. Check back later or order from the menu."
            action={
              <Link href="/" className="btn btn-primary">
                Browse restaurants
              </Link>
            }
          />
        ) : (
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {bags.data!.map((bag) => {
              const canAfford = balance >= bag.salePricePaise;
              return (
                <article key={bag.id} className="group">
                  <div className="relative overflow-hidden rounded-[24px] bg-subtle">
                    <SafeImage
                      src={bag.restaurantImageUrl}
                      alt={bag.title}
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
                      {bag.discountPercent}% off
                    </span>
                    <span className="absolute right-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                      {bag.quantityAvailable} left
                    </span>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">{bag.restaurantName}</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">{bag.title}</h3>
                    <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                      <Star className="h-3 w-3 fill-ink text-ink" /> {bag.restaurantRating.toFixed(1)} · {bag.restaurantCuisines.slice(0, 2).join(", ")}
                    </p>
                    <p className="mt-3 flex items-baseline gap-2">
                      <span className="text-xl font-semibold text-ink tabular">{formatRupees(bag.salePricePaise)}</span>
                      <span className="text-sm text-ink-muted line-through tabular">{formatRupees(bag.originalValuePaise)}</span>
                    </p>
                    <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Pickup {windowLabel(bag.pickupWindowStart, bag.pickupWindowEnd)}
                    </p>
                    <p className="mt-1 flex items-start gap-2 text-xs text-ink-muted">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {bag.restaurantAddress}
                    </p>
                    <button
                      disabled={!canAfford || buying !== null}
                      onClick={() => buy(bag.id, bag.salePricePaise)}
                      className="btn btn-primary btn-block mt-4"
                    >
                      {buying === bag.id ? <Spinner /> : null}
                      {buying === bag.id ? "Reserving…" : canAfford ? `Reserve for ${formatRupees(bag.salePricePaise)}` : "Not enough credits"}
                    </button>
                    {!canAfford && (
                      <p className="mt-2 text-center text-xs text-ink-muted">
                        Need {formatRupees(bag.salePricePaise - balance)} more ·{" "}
                        <Link href="/account?tab=rewards" className="underline underline-offset-4 hover:text-ink">
                          earn credits
                        </Link>
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="mt-16 grid gap-4 border-t border-line pt-10 sm:grid-cols-3">
          {[
            ["Reserve", "Pay with BiteBox Credits and get a pickup code instantly."],
            ["Collect", "Show the code at the counter inside the pickup window."],
            ["Enjoy", "Surprise dishes at up to 60% off. Less food wasted."],
          ].map(([title, body], i) => (
            <div key={title}>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">0{i + 1}</p>
              <p className="mt-2 font-medium text-ink">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

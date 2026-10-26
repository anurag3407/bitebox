"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Clock, Soup, UtensilsCrossed, Wallet } from "lucide-react";
import { EmptyState, PageSpinner, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const DELIVERY_STATUS: Record<string, { label: string; tone: string }> = {
  SCHEDULED: { label: "Scheduled", tone: "badge-neutral" },
  LOCKED_FOR_PREP: { label: "In the kitchen", tone: "badge-warn" },
  DELIVERED: { label: "Delivered", tone: "badge-success" },
  SKIPPED_EARLY: { label: "Skipped", tone: "badge-neutral" },
  CONVERTED_TO_SURPLUS: { label: "Moved to Rescue", tone: "badge-neutral" },
  CANCELLED: { label: "Cancelled", tone: "badge-danger" },
};

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function MealPassPage() {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const [buying, setBuying] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);

  const plans = useQuery({ queryKey: ["meal-plans"], queryFn: () => api.getMealPlans() });
  const passes = useQuery({ queryKey: ["meal-passes"], queryFn: () => api.getMealPasses(), enabled: isLoaded && isSignedIn });
  const deliveries = useQuery({ queryKey: ["meal-deliveries"], queryFn: () => api.getMealDeliveries(), enabled: isLoaded && isSignedIn });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet(), enabled: isLoaded && isSignedIn });
  const balance = wallet.data?.account.balancePaise ?? 0;

  const buy = async (planId: string, pricePaise: number) => {
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=/meal-pass");
      return;
    }
    if (balance < pricePaise) {
      toast("Not enough BiteBox Credits for this pass.", "error");
      return;
    }
    setBuying(planId);
    try {
      const result = await api.purchaseMealPass(planId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meal-passes"] }),
        queryClient.invalidateQueries({ queryKey: ["meal-deliveries"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      toast(
        result.scheduledDeliveries > 0
          ? `Pass active with ${result.scheduledDeliveries} meals scheduled`
          : "Pass active. Meals will be scheduled on your chosen weekdays.",
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBuying(null);
    }
  };

  const skip = async (deliveryId: string) => {
    setSkipping(deliveryId);
    try {
      const result = await api.skipMealDelivery(deliveryId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meal-deliveries"] }),
        queryClient.invalidateQueries({ queryKey: ["meal-passes"] }),
        queryClient.invalidateQueries({ queryKey: ["surplus-bags"] }),
      ]);
      toast(
        result.status === "CONVERTED_TO_SURPLUS"
          ? "Too late to cancel — your meal went to BiteBox Rescue and the kitchen is still paid."
          : "Meal skipped. Your credit stays in the pass.",
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSkipping(null);
    }
  };

  if (plans.isPending || !isLoaded) return <PageSpinner />;
  if (!plans.data) {
    return <div className="page py-10"><p className="notice notice-danger">{errorMessage(plans.error)}</p></div>;
  }

  const myPasses = passes.data?.passes ?? [];
  const activePasses = myPasses.filter((p) => p.status === "ACTIVE");
  const upcoming = (deliveries.data?.deliveries ?? []).filter((d) => d.status === "SCHEDULED" || d.status === "LOCKED_FOR_PREP");

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <Soup className="h-3.5 w-3.5" /> BiteBox Meal Pass
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Lunch,
                <br />
                sorted.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                Prepay for weekday lunches from one kitchen. We auto-schedule the meals, you skip with one tap
                when plans change, and late skips still pay the kitchen.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" /> {formatRupees(balance)} credits
              </span>
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Weekday auto-schedule
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        <section className="mt-10">
          <h2 className="h-section">Choose a pass</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {plans.data.plans.map((plan) => {
              const canAfford = !isSignedIn || balance >= plan.pricePaise;
              const perMeal = Math.round(plan.pricePaise / plan.totalMeals);
              return (
                <article key={plan.id} className="rounded-3xl border border-line bg-white p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">{plan.kitchenName}</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight text-ink">{plan.name}</h3>
                    </div>
                    <span className="badge badge-neutral shrink-0">{plan.totalMeals} meals</span>
                  </div>
                  <p className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight text-ink tabular">{formatRupees(plan.pricePaise)}</span>
                    <span className="text-sm text-ink-muted">· {formatRupees(perMeal)}/meal</span>
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-ink-soft">
                    <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> {plan.slotWindow} delivery</li>
                    <li className="flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {plan.autoScheduleDays.map((d) => WEEKDAYS[d]).join(", ")}
                    </li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5" /> Valid for {plan.validityDays} days</li>
                  </ul>
                  <button
                    className="btn btn-primary btn-block mt-5"
                    disabled={!canAfford || buying !== null}
                    onClick={() => buy(plan.id, plan.pricePaise)}
                  >
                    {buying === plan.id ? <Spinner /> : null}
                    {buying === plan.id
                      ? "Activating…"
                      : !isSignedIn
                        ? "Sign in to buy"
                        : canAfford
                          ? "Buy with credits"
                          : "Not enough credits"}
                  </button>
                  {!canAfford && (
                    <p className="mt-2 text-center text-xs text-ink-muted">
                      Need {formatRupees(plan.pricePaise - balance)} more ·{" "}
                      <Link href="/account?tab=wallet" className="underline underline-offset-4 hover:text-ink">add credits</Link>
                      {" · "}
                      <Link href="/account?tab=rewards" className="underline underline-offset-4 hover:text-ink">earn credits</Link>
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="h-section">Your passes</h2>
            {activePasses.length > 0 && (
              <span className="text-sm text-ink-muted">
                {activePasses.reduce((sum, p) => sum + p.mealsRemaining, 0)} meals remaining
              </span>
            )}
          </div>
          {!isSignedIn ? (
            <p className="notice mt-4">
              <Link href="/sign-in?redirect_url=/meal-pass" className="underline underline-offset-4">Sign in</Link> to buy a pass and see your schedule.
            </p>
          ) : myPasses.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed />}
              title="No meal pass yet"
              body="Buy a pass above and your first week of lunches is scheduled automatically."
            />
          ) : (
            <div className="mt-5 space-y-4">
              {myPasses.map((pass) => {
                const used = pass.totalMeals - pass.mealsRemaining;
                const pct = Math.round((used / pass.totalMeals) * 100);
                return (
                  <article key={pass.id} className="rounded-3xl border border-line bg-white p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{pass.planName}</h3>
                        <p className="mt-1 text-sm text-ink-muted">{pass.kitchenName} · {pass.slotWindow}</p>
                      </div>
                      <span className={`badge ${pass.status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}>
                        {pass.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Meals left" value={String(pass.mealsRemaining)} sub={`of ${pass.totalMeals}`} />
                      <Stat label="Expires" value={new Date(pass.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} sub={`${pass.autoScheduleDays.length} days/week`} />
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="h-section">Next scheduled meals</h2>
          {upcoming.length === 0 ? (
            <p className="notice mt-4">No upcoming meals. Active passes schedule themselves before each weekday.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {upcoming.slice(0, 8).map((meal) => {
                const status = DELIVERY_STATUS[meal.status] ?? { label: meal.status, tone: "badge-neutral" };
                return (
                  <article key={meal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
                    <div>
                      <p className="font-medium text-ink">{dayLabel(meal.deliveryDate)} · {meal.slotWindow}</p>
                      <p className="mt-1 text-sm text-ink-muted">{meal.planName} · {meal.kitchenName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`badge ${status.tone}`}>{status.label}</span>
                      {meal.status === "SCHEDULED" && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={skipping === meal.id}
                          onClick={() => skip(meal.id)}
                        >
                          {skipping === meal.id ? "Skipping…" : "Skip"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Skip before the 90-minute kitchen cutoff and the meal stays in your pass. Later skips are converted
            into a Rescue bag and the kitchen is still paid.
          </p>
        </section>
      </div>
    </div>
  );
}

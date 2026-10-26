"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, MapPin, Soup, Wallet } from "lucide-react";
import { EmptyState, PageSpinner, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

export default function CampusPage() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const campuses = useQuery({ queryKey: ["campuses"], queryFn: () => api.getCampuses() });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet(), enabled: isLoaded && isSignedIn });
  const [dropPoints, setDropPoints] = useState<Record<string, string>>({});
  const [buying, setBuying] = useState<string | null>(null);
  const balance = wallet.data?.account.balancePaise ?? 0;

  const buy = async (campusId: string, plan: { id: string; name: string; pricePaise: number }) => {
    if (!isSignedIn) {
      window.location.href = "/sign-in?redirect_url=/campus";
      return;
    }
    const dropPointId = dropPoints[campusId];
    if (!dropPointId) {
      toast("Choose a campus drop point first", "error");
      return;
    }
    if (balance < plan.pricePaise) {
      toast("Not enough BiteBox Credits for this pass.", "error");
      return;
    }
    setBuying(plan.id);
    try {
      const result = await api.purchaseMealPass(plan.id, dropPointId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["meal-passes"] }),
        queryClient.invalidateQueries({ queryKey: ["meal-deliveries"] }),
      ]);
      toast(`${plan.name} active · ${result.scheduledDeliveries} meals scheduled`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBuying(null);
    }
  };

  if (campuses.isPending || !isLoaded) return <PageSpinner />;
  if (!campuses.data) {
    return <div className="page py-10"><p className="notice notice-danger">{errorMessage(campuses.error)}</p></div>;
  }

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <GraduationCap className="h-3.5 w-3.5" /> BiteBox Campus
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Campus lunches,
                <br />
                sorted for the week.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                Prepaid lunch passes delivered to your hostel gate. Skip before the kitchen cutoff, collect with
                your pass, and never queue between lectures.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
              <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {formatRupees(balance)} credits</span>
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Hostel gate drop points</span>
            </div>
          </div>
        </div>
      </section>

      <div className="page">
        {campuses.data.campuses.length === 0 ? (
          <div className="mt-10">
            <EmptyState icon={<GraduationCap />} title="No campus kitchens yet" body="Campus meal plans will appear here once a kitchen publishes one." />
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {campuses.data.campuses.map((campus) => {
              const selectedDrop = dropPoints[campus.id] ?? campus.dropPoints[0]?.id ?? "";
              return (
                <section key={campus.id} className="rounded-3xl border border-line bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
                        <GraduationCap className="h-5 w-5" /> {campus.name}
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">{campus.plans.length} active meal {campus.plans.length === 1 ? "plan" : "plans"}</p>
                    </div>
                    <label className="min-w-[200px]">
                      <span className="label">Drop point</span>
                      <select
                        className="input"
                        value={selectedDrop}
                        onChange={(e) => setDropPoints({ ...dropPoints, [campus.id]: e.target.value })}
                      >
                        {campus.dropPoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {campus.plans.map((plan) => {
                      const canAfford = !isSignedIn || balance >= plan.pricePaise;
                      return (
                        <article key={plan.id} className="rounded-2xl border border-line bg-subtle/40 p-5">
                          <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">{plan.kitchenName}</p>
                          <h3 className="mt-1 font-semibold text-ink">{plan.name}</h3>
                          <p className="mt-2 text-xl font-semibold tracking-tight text-ink tabular">
                            {formatRupees(plan.pricePaise)}
                            <span className="ml-1 text-sm font-normal text-ink-muted">· {plan.totalMeals} meals</span>
                          </p>
                          <p className="mt-1 text-sm text-ink-muted">{plan.slotWindow} · valid {plan.validityDays} days</p>
                          <button
                            className="btn btn-primary btn-block mt-4"
                            disabled={buying !== null || !canAfford}
                            onClick={() => buy(campus.id, plan)}
                          >
                            {buying === plan.id ? <Spinner /> : <Soup className="h-4 w-4" />}
                            {buying === plan.id ? "Activating…" : !isSignedIn ? "Sign in to buy" : canAfford ? "Buy with credits" : "Not enough credits"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  {isSignedIn && campus.plans.some((p) => balance < p.pricePaise) && (
                    <p className="mt-3 text-xs text-ink-muted">
                      Need more credits?{" "}
                      <Link href="/account?tab=wallet" className="underline underline-offset-4 hover:text-ink">add credits</Link>
                      {" · "}
                      <Link href="/account?tab=rewards" className="underline underline-offset-4 hover:text-ink">earn credits</Link>
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

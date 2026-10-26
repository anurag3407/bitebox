"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Flame, Gift, MapPin, Trophy } from "lucide-react";
import { useApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { formatRupees, formatTime } from "@/lib/format";
import { RiderInsurancePanel } from "@/components/rider/insurance-panel";

function endsIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

export function RiderRewardsPanel() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const rewards = useQuery({ queryKey: ["rider-rewards"], queryFn: () => api.getRiderRewards() });
  const [busy, setBusy] = useState<string | null>(null);

  if (rewards.isPending) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-32" />
        <div className="skeleton h-56" />
      </div>
    );
  }
  if (!rewards.data) return <p className="notice notice-danger">{errorMessage(rewards.error)}</p>;
  const r = rewards.data;

  const act = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["rider-rewards"] });
      await queryClient.invalidateQueries({ queryKey: ["rider-earnings"] });
      toast(success, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-ink p-6 text-white sm:p-7">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-white/55">
          <Trophy className="h-3.5 w-3.5" /> Partner rewards
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Ride more. Earn more.</h1>
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm">
          <span>
            <span className="block text-white/45">Delivered today</span>
            <span className="mt-1 block text-lg font-semibold tabular">{r.deliveredToday}</span>
          </span>
          <span>
            <span className="block text-white/45">Bonus claimed</span>
            <span className="mt-1 block text-lg font-semibold tabular">{formatRupees(r.claimedBonusPaise)}</span>
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Flame className="h-4 w-4" /> Delivery quests
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Bonuses land in your next weekly payout.</p>
          </div>
        </div>
        {r.incentives.length === 0 ? (
          <p className="notice">No active quests right now. New ones drop around meal peaks.</p>
        ) : (
          r.incentives.map((quest) => {
            const pct = Math.min(100, Math.round((quest.progressDeliveries / quest.targetDeliveries) * 100));
            const done = quest.progressDeliveries >= quest.targetDeliveries;
            return (
              <article key={quest.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">{quest.title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{quest.description}</p>
                  </div>
                  <span className="badge badge-neutral shrink-0 tabular">{formatRupees(quest.rewardPaise)}</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-muted">
                  <span className="tabular">
                    {quest.progressDeliveries}/{quest.targetDeliveries} deliveries
                  </span>
                  <span>{endsIn(quest.endsAt)}</span>
                </div>
                <div className="mt-4">
                  {quest.claimedAt ? (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <Check className="h-4 w-4" /> Bonus claimed · paid with your next payout
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      disabled={!quest.canClaim || busy === quest.id}
                      onClick={() => act(quest.id, () => api.claimRiderIncentive(quest.id), `${formatRupees(quest.rewardPaise)} bonus added to your payout`)}
                    >
                      {busy === quest.id ? "Claiming…" : done ? `Claim ${formatRupees(quest.rewardPaise)}` : `${quest.targetDeliveries - quest.progressDeliveries} more to unlock`}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <CalendarClock className="h-4 w-4" /> Book a shift
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Reserve a slot so dispatch knows when you&apos;re available. One shift per window.</p>
        </div>
        {r.shifts.length === 0 ? (
          <p className="notice">No upcoming shifts published. Check back before the next peak.</p>
        ) : (
          r.shifts.map((shift) => (
            <article key={shift.id} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <Gift className="h-4 w-4 shrink-0" /> {shift.label}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {formatTime(shift.startsAt)} – {formatTime(shift.endsAt)}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {shift.isBooked ? "You’re booked" : `${shift.spotsLeft} of ${shift.capacity} slots left`}
                </p>
              </div>
              {shift.isBooked ? (
                <button
                  type="button"
                  className="btn btn-secondary shrink-0"
                  disabled={!shift.canCancel || busy === shift.id}
                  onClick={() => act(shift.id, () => api.cancelRiderShift(shift.id), "Shift cancelled")}
                >
                  {busy === shift.id ? "…" : shift.canCancel ? "Cancel" : "Started"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary shrink-0"
                  disabled={!shift.canBook || busy === shift.id}
                  onClick={() => act(shift.id, () => api.bookRiderShift(shift.id), "Shift booked")}
                >
                  {busy === shift.id ? "…" : shift.canBook ? "Book" : "Full"}
                </button>
              )}
            </article>
          ))
        )}
      </section>

      <RiderInsurancePanel />
    </div>
  );
}

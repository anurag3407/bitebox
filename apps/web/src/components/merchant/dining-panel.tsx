"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Users, UtensilsCrossed } from "lucide-react";
import { useApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";

function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function MerchantDiningPanel({ restaurantId }: { restaurantId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIst());
  const [busy, setBusy] = useState<string | null>(null);

  const bookings = useQuery({
    queryKey: ["merchant-dining", restaurantId, date],
    queryFn: () => api.getMerchantDining(restaurantId, date),
    refetchInterval: 20_000,
  });

  const act = async (id: string, status: "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW") => {
    setBusy(id);
    try {
      await api.updateDiningStatus(restaurantId, id, status);
      await queryClient.invalidateQueries({ queryKey: ["merchant-dining", restaurantId, date] });
      toast(`Booking marked ${status.toLowerCase().replace("_", " ")}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const active = (bookings.data ?? []).filter((b) => b.status === "CONFIRMED" || b.status === "SEATED");
  const covers = active.reduce((sum, b) => sum + b.partySize, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-subtle px-5 py-4">
            <p className="text-[13px] text-ink-muted">Bookings</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular">{active.length}</p>
          </div>
          <div className="rounded-3xl bg-subtle px-5 py-4">
            <p className="text-[13px] text-ink-muted">Covers</p>
            <p className="mt-1 text-2xl font-semibold text-ink tabular">{covers}</p>
          </div>
        </div>
        <label className="flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-ink-muted" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input h-11 w-auto" aria-label="Booking date" />
        </label>
      </div>

      {bookings.isPending ? (
        <div className="skeleton mt-6 h-48" />
      ) : (bookings.data?.length ?? 0) === 0 ? (
        <EmptyState icon={<UtensilsCrossed />} title="No bookings for this day" body="Reservations made through BiteBox Dining appear here in real time." />
      ) : (
        <ul className="rows mt-6 max-w-3xl">
          {bookings.data!.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex gap-4">
                <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-subtle">
                  <span className="text-[11px] font-semibold text-ink tabular">{b.slot}</span>
                  <span className="text-[10px] text-ink-muted">{b.partySize} pax</span>
                </span>
                <div>
                  <p className="font-medium text-ink">{b.customerName}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    Code {b.confirmationCode}
                    {b.occasion ? ` · ${b.occasion.toLowerCase().replace(/_/g, " ")}` : ""}
                  </p>
                  {b.specialRequest && <p className="mt-1 text-xs text-ink-soft">“{b.specialRequest}”</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`badge ${
                    b.status === "SEATED" ? "badge-success" : b.status === "CANCELLED" || b.status === "NO_SHOW" ? "badge-danger" : "badge-neutral"
                  }`}
                >
                  {b.status.toLowerCase().replace("_", " ")}
                </span>
                {b.status === "CONFIRMED" && (
                  <>
                    <button disabled={busy === b.id} onClick={() => act(b.id, "SEATED")} className="btn btn-primary btn-sm">
                      {busy === b.id && <Spinner />} Seat
                    </button>
                    <button disabled={busy === b.id} onClick={() => act(b.id, "NO_SHOW")} className="btn btn-ghost btn-sm text-ink-muted">
                      No-show
                    </button>
                  </>
                )}
                {b.status === "SEATED" && (
                  <button disabled={busy === b.id} onClick={() => act(b.id, "COMPLETED")} className="btn btn-outline btn-sm">
                    Complete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-ink-muted">
        <Users className="h-3.5 w-3.5" /> Tables are held for 15 minutes after the booking time.
      </p>
    </div>
  );
}

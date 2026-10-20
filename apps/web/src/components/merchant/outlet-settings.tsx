"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { OpeningHours } from "@startup/contracts";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const field = "w-full p-2.5 rounded-xl border border-border text-sm";

function HoursEditor({ value, onChange }: { value: OpeningHours | null; onChange: (v: OpeningHours | null) => void }) {
  const alwaysOpen = !value;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={alwaysOpen} onChange={(e) => onChange(e.target.checked ? null : Object.fromEntries(DAYS.map((d) => [d, [["11:00", "23:00"]]])) as OpeningHours)} />
        Open 24 hours, every day
      </label>
      {!alwaysOpen &&
        DAYS.map((day) => {
          const ranges = value![day] ?? [];
          const setRanges = (r: [string, string][]) => onChange({ ...value!, [day]: r });
          return (
            <div key={day} className="flex items-start gap-3 text-sm">
              <span className="w-10 pt-2 font-bold capitalize">{day}</span>
              <div className="flex-1 space-y-1">
                {ranges.length === 0 && <p className="text-xs text-text-secondary pt-2">Closed</p>}
                {ranges.map(([open, close], i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="time" value={open} onChange={(e) => setRanges(ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)) as [string, string][])} className="p-1.5 rounded-lg border border-border" />
                    <span>–</span>
                    <input type="time" value={close} onChange={(e) => setRanges(ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)) as [string, string][])} className="p-1.5 rounded-lg border border-border" />
                    {close <= open && <span className="text-[10px] text-text-secondary">next day</span>}
                    <button aria-label="Remove time range" onClick={() => setRanges(ranges.filter((_, j) => j !== i))} className="p-1 text-text-secondary">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setRanges([...ranges, ["18:00", "23:00"]])} className="text-xs font-bold text-brand">
                  + Add hours
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
}

export function OutletSettings({ restaurantId, isOwner }: { restaurantId: string; isOwner: boolean }) {
  const api = useApi();
  const toast = useToast();
  const menu = useQuery({ queryKey: ["editable-menu", restaurantId], queryFn: () => api.getEditableMenu(restaurantId) });
  const staff = useQuery({ queryKey: ["staff", restaurantId], queryFn: () => api.getStaff(restaurantId) });
  const [s, setS] = useState<{ description: string; phone: string; packaging: string; prep: string; avgPrice: string; heroImageUrl: string; isOpen: boolean; hours: OpeningHours | null } | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("KITCHEN");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = menu.data?.restaurant;
    if (r && !s) {
      setS({
        description: r.description ?? "",
        phone: r.phone ?? "",
        packaging: String(r.packagingFeePaise / 100),
        prep: String(r.avgPrepMinutes),
        avgPrice: String(r.avgPriceForOnePaise / 100),
        heroImageUrl: r.heroImageUrl ?? "",
        isOpen: r.isOpen,
        hours: (r.openingHours as OpeningHours | null) ?? null,
      });
    }
  }, [menu.data, s]);

  if (!s) return <Spinner />;
  return (
    <div className="space-y-8">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.updateRestaurantSettings(restaurantId, {
              description: s.description || undefined,
              phone: s.phone || undefined,
              packagingFeePaise: Math.round(Number(s.packaging) * 100),
              avgPrepMinutes: Number(s.prep),
              avgPriceForOnePaise: Math.round(Number(s.avgPrice) * 100),
              heroImageUrl: s.heroImageUrl || undefined,
              isOpen: s.isOpen,
              openingHours: s.hours,
            });
            toast("Outlet settings saved", "success");
          } catch (err) {
            toast(errorMessage(err), "error");
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-text-secondary">Outlet phone<input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-text-secondary">Packaging charge (₹)<input inputMode="decimal" value={s.packaging} onChange={(e) => setS({ ...s, packaging: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-text-secondary">Average preparation time (min)<input type="number" min={5} max={90} value={s.prep} onChange={(e) => setS({ ...s, prep: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-text-secondary">Average price for one (₹)<input inputMode="decimal" value={s.avgPrice} onChange={(e) => setS({ ...s, avgPrice: e.target.value })} className={field} /></label>
        </div>
        <label className="block text-xs font-semibold text-text-secondary">Cover photo URL<input value={s.heroImageUrl} onChange={(e) => setS({ ...s, heroImageUrl: e.target.value })} className={field} /></label>
        <label className="block text-xs font-semibold text-text-secondary">About the outlet<textarea rows={2} maxLength={300} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} className={field} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={s.isOpen} onChange={(e) => setS({ ...s, isOpen: e.target.checked })} />
          Outlet operating (untick to close until further notice)
        </label>
        <div>
          <h3 className="font-bold mb-2">Opening hours (IST)</h3>
          <HoursEditor value={s.hours} onChange={(hours) => setS({ ...s, hours })} />
        </div>
        <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-bold">
          Save settings
        </button>
      </form>

      <section>
        <h3 className="font-bold mb-2">Staff</h3>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-white">
          {staff.data?.map((m) => (
            <li key={m.userId} className="p-3 flex items-center justify-between text-sm">
              <span>
                {m.name} <span className="text-xs text-text-secondary">· {m.email} · {m.staffRole.toLowerCase().replace("_", " ")}</span>
              </span>
              {isOwner && m.staffRole !== "OWNER" && (
                <button
                  onClick={async () => {
                    try {
                      await api.removeStaff(restaurantId, m.userId);
                      staff.refetch();
                    } catch (err) {
                      toast(errorMessage(err), "error");
                    }
                  }}
                  className="text-xs font-bold text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.addStaff(restaurantId, staffEmail, staffRole);
                toast("Staff member added", "success");
                setStaffEmail("");
                staff.refetch();
              } catch (err) {
                toast(errorMessage(err), "error");
              }
            }}
            className="flex flex-wrap gap-2 mt-3"
          >
            <input required type="email" placeholder="Their account email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} className="flex-1 min-w-[200px] p-2.5 rounded-xl border border-border text-sm" />
            <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="p-2.5 rounded-xl border border-border text-sm">
              <option value="KITCHEN">Kitchen (orders & stock)</option>
              <option value="CATALOG_EDITOR">Menu editor</option>
              <option value="MANAGER">Manager</option>
            </select>
            <button className="px-4 py-2.5 rounded-xl bg-text-primary text-white text-sm font-bold">Add</button>
          </form>
        )}
      </section>
    </div>
  );
}

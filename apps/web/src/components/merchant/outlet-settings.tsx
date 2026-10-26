"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import type { OpeningHours } from "@startup/contracts";
import { Field, Toggle } from "@/components/ui/field";
import { ActionDialog } from "@/components/ui/modal";
import { PageSpinner, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<(typeof DAYS)[number], string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const STAFF_ROLE_LABEL: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", KITCHEN: "Kitchen", CATALOG_EDITOR: "Menu editor" };

function HoursEditor({ value, onChange }: { value: OpeningHours | null; onChange: (v: OpeningHours | null) => void }) {
  const alwaysOpen = !value;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-subtle px-4 py-3">
        <span className="text-sm text-ink">Open 24 hours, every day</span>
        <Toggle
          size="sm"
          label="Open 24 hours"
          checked={alwaysOpen}
          onChange={(on) => onChange(on ? null : (Object.fromEntries(DAYS.map((d) => [d, [["11:00", "23:00"]]])) as OpeningHours))}
        />
      </div>
      {!alwaysOpen && (
        <ul className="rows">
          {DAYS.map((day) => {
            const ranges = value![day] ?? [];
            const setRanges = (r: [string, string][]) => onChange({ ...value!, [day]: r });
            return (
              <li key={day} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
                <span className="w-28 pt-2 text-sm font-medium text-ink">{DAY_LABEL[day]}</span>
                <div className="flex-1 space-y-2">
                  {ranges.length === 0 && <p className="pt-2 text-sm text-ink-muted">Closed</p>}
                  {ranges.map(([open, close], i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="time"
                        aria-label={`${DAY_LABEL[day]} opens`}
                        value={open}
                        onChange={(e) => setRanges(ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)) as [string, string][])}
                        className="input input-sm w-32"
                      />
                      <span className="text-ink-muted">–</span>
                      <input
                        type="time"
                        aria-label={`${DAY_LABEL[day]} closes`}
                        value={close}
                        onChange={(e) => setRanges(ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)) as [string, string][])}
                        className="input input-sm w-32"
                      />
                      {close <= open && <span className="text-xs text-ink-muted">next day</span>}
                      <button aria-label="Remove time range" onClick={() => setRanges(ranges.filter((_, j) => j !== i))} className="btn btn-ghost btn-icon h-8 w-8">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setRanges([...ranges, ["18:00", "23:00"]])} className="btn btn-ghost btn-sm -ml-4">
                    <Plus className="h-3.5 w-3.5" /> Add hours
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Block({ title, body, first, children }: { title: string; body?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={`grid gap-6 lg:grid-cols-[260px_1fr] lg:gap-16 ${first ? "pb-10" : "border-t border-line py-10"}`}>
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {body && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>}
      </div>
      <div className="min-w-0 max-w-2xl">{children}</div>
    </section>
  );
}

export function OutletSettings({ restaurantId, isOwner }: { restaurantId: string; isOwner: boolean }) {
  const api = useApi();
  const toast = useToast();
  const menu = useQuery({ queryKey: ["editable-menu", restaurantId], queryFn: () => api.getEditableMenu(restaurantId) });
  const staff = useQuery({ queryKey: ["staff", restaurantId], queryFn: () => api.getStaff(restaurantId) });
  const [s, setS] = useState<{
    description: string;
    phone: string;
    packaging: string;
    prep: string;
    avgPrice: string;
    heroImageUrl: string;
    amenities: string;
    gallery: string;
    hygieneRating: string;
    isOpen: boolean;
    hours: OpeningHours | null;
  } | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("KITCHEN");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);

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
        amenities: (r.amenities ?? []).join(", "),
        gallery: (r.gallery ?? []).join("\n"),
        hygieneRating: r.hygieneRating ? String(r.hygieneRating) : "4",
        isOpen: r.isOpen,
        hours: (r.openingHours as OpeningHours | null) ?? null,
      });
    }
  }, [menu.data, s]);

  if (!s) return <PageSpinner />;
  return (
    <div>
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
              amenities: s.amenities
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
              gallery: s.gallery
                .split("\n")
                .map((g) => g.trim())
                .filter(Boolean),
              hygieneRating: Number(s.hygieneRating),
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
        className="contents"
      >
        <Block first title="Outlet" body="What customers see on your page.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Outlet phone">
              <input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} className="input" inputMode="tel" />
            </Field>
            <Field label="Average price for one (₹)">
              <input inputMode="decimal" value={s.avgPrice} onChange={(e) => setS({ ...s, avgPrice: e.target.value })} className="input" />
            </Field>
            <Field label="Packaging charge (₹)">
              <input inputMode="decimal" value={s.packaging} onChange={(e) => setS({ ...s, packaging: e.target.value })} className="input" />
            </Field>
            <Field label="Average preparation time (min)">
              <input type="number" min={5} max={90} value={s.prep} onChange={(e) => setS({ ...s, prep: e.target.value })} className="input" />
            </Field>
            <Field label="Cover photo URL" className="sm:col-span-2">
              <input value={s.heroImageUrl} onChange={(e) => setS({ ...s, heroImageUrl: e.target.value })} className="input" />
            </Field>
            <Field label="About the outlet" className="sm:col-span-2">
              <textarea rows={3} maxLength={300} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} className="input" />
            </Field>
            <Field label="Amenities" hint="Comma separated, e.g. Outdoor seating, Parking" className="sm:col-span-2">
              <input value={s.amenities} onChange={(e) => setS({ ...s, amenities: e.target.value })} className="input" />
            </Field>
            <Field label="Gallery image URLs" hint="One URL per line, up to 10" className="sm:col-span-2">
              <textarea rows={3} value={s.gallery} onChange={(e) => setS({ ...s, gallery: e.target.value })} className="input" />
            </Field>
            <Field label="Hygiene rating" hint="Self-declared FSSAI-aligned rating, shown on your storefront">
              <select className="input" value={s.hygieneRating} onChange={(e) => setS({ ...s, hygieneRating: e.target.value })}>
                {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}
              </select>
            </Field>
          </div>
        </Block>

        <Block title="Hours" body="All times are IST. Turn the outlet off to close until further notice.">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-subtle px-4 py-3">
              <span className="text-sm text-ink">Outlet operating</span>
              <Toggle size="sm" label="Outlet operating" checked={s.isOpen} onChange={(isOpen) => setS({ ...s, isOpen })} />
            </div>
            <HoursEditor value={s.hours} onChange={(hours) => setS({ ...s, hours })} />
            <button disabled={busy} className="btn btn-primary">
              {busy && <Spinner />} Save settings
            </button>
          </div>
        </Block>
      </form>

      <Block title="Staff" body="People who can use this console. Kitchen staff see orders and stock; menu editors can change dishes.">
        <ul className="rows">
          {staff.data?.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">{m.name}</p>
                <p className="truncate text-sm text-ink-muted">
                  {m.email} · {STAFF_ROLE_LABEL[m.staffRole] ?? m.staffRole}
                </p>
              </div>
              {isOwner && m.staffRole !== "OWNER" && (
                <button onClick={() => setRemoving({ userId: m.userId, name: m.name })} className="btn btn-danger-ghost btn-sm">
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
            className="mt-6 flex flex-wrap gap-2"
          >
            <input required type="email" placeholder="Their account email" aria-label="Staff email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} className="input min-w-[200px] flex-1" />
            <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} aria-label="Staff role" className="input w-auto">
              <option value="KITCHEN">Kitchen</option>
              <option value="CATALOG_EDITOR">Menu editor</option>
              <option value="MANAGER">Manager</option>
            </select>
            <button className="btn btn-primary h-12">Add</button>
          </form>
        )}
      </Block>

      <ActionDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They'll lose access to this console immediately."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          try {
            await api.removeStaff(restaurantId, removing!.userId);
            staff.refetch();
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
    </div>
  );
}

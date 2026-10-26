"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Leaf, Plus } from "lucide-react";
import type { MerchantSurplusListing } from "@startup/api-client";
import { Field, MoneyInput } from "@/components/ui/field";
import { EmptyState, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const DISCOUNTS = [4000, 5000, 6000, 7000];

function defaultWindow(): { start: string; end: string } {
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const local = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return { start: local(start), end: local(end) };
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "badge-success",
  SOLD_OUT: "badge-neutral",
  CANCELLED: "badge-danger",
  EXPIRED: "badge-warn",
};

export function MerchantSurplusPanel({ restaurantId }: { restaurantId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const listings = useQuery({ queryKey: ["merchant-surplus", restaurantId], queryFn: () => api.getMerchantSurplus(restaurantId) });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [originalPaise, setOriginalPaise] = useState(45000);
  const [discountBp, setDiscountBp] = useState(6000);
  const [feePaise, setFeePaise] = useState(1900);
  const [quantity, setQuantity] = useState("5");
  const initialWindow = defaultWindow();
  const [start, setStart] = useState(initialWindow.start);
  const [end, setEnd] = useState(initialWindow.end);

  const salePricePaise = Math.round((originalPaise * (10000 - discountBp)) / 10000);
  const proceedsPaise = salePricePaise - feePaise;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["merchant-surplus", restaurantId] });

  const create = async () => {
    setBusy("create");
    try {
      await api.createMerchantSurplus(restaurantId, {
        title: title.trim(),
        originalValuePaise: originalPaise,
        discountBp,
        platformFlatFeePaise: feePaise,
        quantity: Number(quantity),
        pickupWindowStart: new Date(start).toISOString(),
        pickupWindowEnd: new Date(end).toISOString(),
      });
      await invalidate();
      queryClient.invalidateQueries({ queryKey: ["surplus-bags"] });
      toast("Rescue bag published", "success");
      setOpen(false);
      setTitle("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (listing: MerchantSurplusListing) => {
    const next = listing.status === "ACTIVE" ? "CANCELLED" : "ACTIVE";
    setBusy(listing.id);
    try {
      await api.setMerchantSurplusStatus(restaurantId, listing.id, next);
      await invalidate();
      queryClient.invalidateQueries({ queryKey: ["surplus-bags"] });
      toast(next === "ACTIVE" ? "Rescue bag is live" : "Rescue bag paused", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  if (listings.isPending) return <div className="skeleton h-64" />;
  if (!listings.data) return <p className="notice notice-danger">{errorMessage(listings.error)}</p>;
  const rows = listings.data.listings;
  const active = rows.filter((l) => l.status === "ACTIVE");
  const unitsLeft = active.reduce((sum, l) => sum + l.quantityAvailable, 0);
  const sold = rows.reduce((sum, l) => sum + l.soldCount, 0);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="h-section">Rescue bags</h1>
            <p className="mt-1 text-sm text-ink-muted">Turn surplus into discounted pickup bags and reach nearby customers.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setOpen(!open)}>
            <Plus className="h-4 w-4" /> New rescue bag
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Live bags" value={String(active.length)} sub="Visible to customers" />
          <Stat label="Units left" value={String(unitsLeft)} sub="Across live bags" />
          <Stat label="Sold" value={String(sold)} sub="Pickup orders" />
        </div>
      </section>

      {open && (
        <section className="rounded-3xl border border-line bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Leaf className="h-4 w-4" /> Publish a rescue bag
            </h2>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Bag title</span>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Surprise Tandoori Rescue Bag" maxLength={120} />
            </label>
            <Field label="Original value">
              <MoneyInput paise={originalPaise} onChange={setOriginalPaise} ariaLabel="Original value" />
            </Field>
            <Field label="Platform fee">
              <MoneyInput paise={feePaise} onChange={setFeePaise} ariaLabel="Platform fee" />
            </Field>
            <div className="sm:col-span-2">
              <span className="label">Discount</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Discount">
                {DISCOUNTS.map((bp) => (
                  <button
                    key={bp}
                    role="radio"
                    aria-checked={discountBp === bp}
                    onClick={() => setDiscountBp(bp)}
                    className={`chip h-10 px-4 ${discountBp === bp ? "chip-active" : ""}`}
                  >
                    {bp / 100}% off
                  </button>
                ))}
              </div>
            </div>
            <Field label="Quantity">
              <input className="input" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </Field>
            <div className="rounded-2xl bg-subtle px-4 py-3 text-sm">
              <p className="flex justify-between"><span className="text-ink-muted">Customer pays</span><span className="font-semibold text-ink tabular">{formatRupees(salePricePaise)}</span></p>
              <p className="mt-1 flex justify-between"><span className="text-ink-muted">You receive</span><span className="font-medium text-ink tabular">{formatRupees(Math.max(0, proceedsPaise))}</span></p>
            </div>
            <label>
              <span className="label">Pickup starts</span>
              <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              <span className="label">Pickup ends</span>
              <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={busy === "create" || title.trim().length < 3 || proceedsPaise <= 0 || Number(quantity) < 1}
              onClick={create}
            >
              {busy === "create" && <Spinner />} Publish bag
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="h-section">Your bags</h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Leaf />}
            title="No rescue bags yet"
            body="Publish surplus from today's prep. Customers reserve with credits and collect inside the pickup window."
          />
        ) : (
          <div className="mt-5 space-y-3">
            {rows.map((listing) => (
              <article key={listing.id} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{listing.title}</h3>
                    <span className={`badge ${STATUS_TONE[listing.status] ?? "badge-neutral"}`}>{listing.status.toLowerCase().replace("_", " ")}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    <span className="font-medium text-ink tabular">{formatRupees(listing.salePricePaise)}</span>{" "}
                    <span className="line-through tabular">{formatRupees(listing.originalValuePaise)}</span> · {listing.quantityAvailable} left · {listing.soldCount} sold
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
                    <Clock className="h-3.5 w-3.5" /> {formatDateTime(listing.pickupWindowStart)} – {formatDateTime(listing.pickupWindowEnd)}
                  </p>
                </div>
                {(listing.status === "ACTIVE" || listing.status === "CANCELLED") && (
                  <button className="btn btn-secondary btn-sm" disabled={busy === listing.id} onClick={() => toggle(listing)}>
                    {busy === listing.id && <Spinner />}
                    {listing.status === "ACTIVE" ? "Pause" : "Resume"}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Customers reserve with BiteBox Credits and collect at your counter. A pause hides the bag immediately;
          sold-out and expired bags stay in this history.
        </p>
      </section>
    </div>
  );
}

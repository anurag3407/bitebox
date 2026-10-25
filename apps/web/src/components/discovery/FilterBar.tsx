"use client";

import React from "react";
import { X } from "lucide-react";

export type SortOption = "relevance" | "distance" | "rating" | "delivery_time" | "cost_low_to_high" | "cost_high_to_low";

export interface DiscoveryFilters {
  pureVeg: boolean;
  minRating: number | null;
  fastDelivery: boolean;
  hasOffer: boolean;
  sortBy: SortOption;
}

const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Recommended",
  distance: "Nearest",
  rating: "Top rated",
  delivery_time: "Fastest",
  cost_low_to_high: "Price: low to high",
  cost_high_to_low: "Price: high to low",
};

export function FilterBar({
  filters,
  onChange,
  hasLocation,
}: {
  filters: DiscoveryFilters;
  onChange: (next: DiscoveryFilters) => void;
  hasLocation: boolean;
}) {
  const set = (patch: Partial<DiscoveryFilters>) => onChange({ ...filters, ...patch });
  const active = Number(filters.pureVeg) + Number(!!filters.minRating) + Number(filters.fastDelivery) + Number(filters.hasOffer);

  return (
    <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <label className="relative shrink-0">
        <span className="sr-only">Sort restaurants</span>
        <select
          value={filters.sortBy}
          onChange={(e) => set({ sortBy: e.target.value as SortOption })}
          className={`chip cursor-pointer appearance-none pr-9 [&>option]:text-ink ${filters.sortBy !== "relevance" ? "chip-active" : ""}`}
        >
          {(Object.keys(SORT_LABELS) as SortOption[])
            .filter((k) => hasLocation || k !== "distance")
            .map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
        </select>
        <svg viewBox="0 0 16 16" className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-current" strokeWidth="2" aria-hidden>
          <path d="m4 6 4 4 4-4" className={filters.sortBy !== "relevance" ? "stroke-white" : "stroke-ink-muted"} />
        </svg>
      </label>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
      <button className="chip" aria-pressed={filters.pureVeg} onClick={() => set({ pureVeg: !filters.pureVeg })}>
        Pure veg
      </button>
      <button className="chip" aria-pressed={!!filters.minRating} onClick={() => set({ minRating: filters.minRating ? null : 4 })}>
        Rated 4.0+
      </button>
      <button className="chip" aria-pressed={filters.fastDelivery} onClick={() => set({ fastDelivery: !filters.fastDelivery })}>
        Under 30 min
      </button>
      <button className="chip" aria-pressed={filters.hasOffer} onClick={() => set({ hasOffer: !filters.hasOffer })}>
        Offers
      </button>
      {active > 0 && (
        <button
          onClick={() => onChange({ pureVeg: false, minRating: null, fastDelivery: false, hasOffer: false, sortBy: filters.sortBy })}
          className="btn btn-ghost btn-sm gap-1"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}

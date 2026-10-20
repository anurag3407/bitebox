"use client";

import React from "react";
import { Star, Zap, Tag, ArrowUpDown } from "lucide-react";

export type SortOption = "relevance" | "distance" | "rating" | "delivery_time" | "cost_low_to_high" | "cost_high_to_low";

export interface DiscoveryFilters {
  pureVeg: boolean;
  minRating: number | null;
  fastDelivery: boolean;
  hasOffer: boolean;
  sortBy: SortOption;
}

const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Relevance",
  distance: "Distance",
  rating: "Rating: high to low",
  delivery_time: "Delivery time",
  cost_low_to_high: "Cost: low to high",
  cost_high_to_low: "Cost: high to low",
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shrink-0 ${
        active ? "bg-brand-light text-brand border-brand" : "bg-white text-text-primary border-border hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

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
    <div className="flex items-center gap-2 overflow-x-auto py-3 border-y border-border sticky top-16 bg-white z-30 -mx-4 px-4 sm:mx-0 sm:px-0">
      <label className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-border text-xs font-semibold shrink-0">
        <ArrowUpDown className="w-3.5 h-3.5" />
        <select
          value={filters.sortBy}
          onChange={(e) => set({ sortBy: e.target.value as SortOption })}
          className="bg-transparent focus:outline-none"
          aria-label="Sort restaurants"
        >
          {(Object.keys(SORT_LABELS) as SortOption[])
            .filter((k) => hasLocation || k !== "distance")
            .map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
        </select>
      </label>
      <Chip active={filters.pureVeg} onClick={() => set({ pureVeg: !filters.pureVeg })}>
        <span className="w-2.5 h-2.5 rounded-sm border border-success flex items-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
        </span>
        Pure Veg
      </Chip>
      <Chip active={!!filters.minRating} onClick={() => set({ minRating: filters.minRating ? null : 4 })}>
        <Star className="w-3.5 h-3.5" /> Rating 4.0+
      </Chip>
      <Chip active={filters.fastDelivery} onClick={() => set({ fastDelivery: !filters.fastDelivery })}>
        <Zap className="w-3.5 h-3.5 text-amber-500" /> Under 30 mins
      </Chip>
      <Chip active={filters.hasOffer} onClick={() => set({ hasOffer: !filters.hasOffer })}>
        <Tag className="w-3.5 h-3.5" /> Offers
      </Chip>
      {active > 0 && (
        <button
          onClick={() => onChange({ pureVeg: false, minRating: null, fastDelivery: false, hasOffer: false, sortBy: filters.sortBy })}
          className="text-xs text-brand font-bold underline shrink-0 ml-1"
        >
          Clear ({active})
        </button>
      )}
    </div>
  );
}

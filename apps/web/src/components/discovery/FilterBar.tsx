"use client";

import React from "react";
import { SlidersHorizontal, Star, Zap, Tag } from "lucide-react";

interface FilterBarProps {
  pureVeg: boolean;
  onTogglePureVeg: () => void;
  minRating: number | null;
  onToggleRating: () => void;
  fastDelivery: boolean;
  onToggleFastDelivery: () => void;
  hasOffer: boolean;
  onToggleOffer: () => void;
  activeCount: number;
  onClearAll: () => void;
}

export function FilterBar({
  pureVeg,
  onTogglePureVeg,
  minRating,
  onToggleRating,
  fastDelivery,
  onToggleFastDelivery,
  hasOffer,
  onToggleOffer,
  activeCount,
  onClearAll,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-3 border-y border-border sticky top-16 bg-white z-30">
      {/* 1. Pure Veg Toggle */}
      <button
        onClick={onTogglePureVeg}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shrink-0 ${
          pureVeg
            ? "bg-success-light text-success border-success"
            : "bg-white text-text-primary border-border hover:bg-surface-muted"
        }`}
      >
        <span className="w-2.5 h-2.5 rounded-sm border border-success flex items-center justify-center p-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
        </span>
        <span>Pure Veg</span>
      </button>

      {/* 2. Rating 4.0+ */}
      <button
        onClick={onToggleRating}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shrink-0 ${
          minRating
            ? "bg-brand-light text-brand border-brand"
            : "bg-white text-text-primary border-border hover:bg-surface-muted"
        }`}
      >
        <Star className={`w-3.5 h-3.5 ${minRating ? "fill-brand text-brand" : "text-text-secondary"}`} />
        <span>Rating 4.0+</span>
      </button>

      {/* 3. Fast Delivery (<30 mins) */}
      <button
        onClick={onToggleFastDelivery}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shrink-0 ${
          fastDelivery
            ? "bg-brand-light text-brand border-brand"
            : "bg-white text-text-primary border-border hover:bg-surface-muted"
        }`}
      >
        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
        <span>Under 30 mins</span>
      </button>

      {/* 4. Great Offers */}
      <button
        onClick={onToggleOffer}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shrink-0 ${
          hasOffer
            ? "bg-brand-light text-brand border-brand"
            : "bg-white text-text-primary border-border hover:bg-surface-muted"
        }`}
      >
        <Tag className="w-3.5 h-3.5 text-brand" />
        <span>Offers</span>
      </button>

      {activeCount > 0 && (
        <button
          onClick={onClearAll}
          className="text-xs text-brand font-bold underline hover:text-brand-hover shrink-0 ml-2"
        >
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  );
}

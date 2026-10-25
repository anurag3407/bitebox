"use client";

import React from "react";
import { SafeImage } from "@/components/ui/misc";

interface CuisineItem {
  label: string;
  // Matched case-insensitively against restaurant cuisines on the server, so it must
  // be the catalogue's spelling (e.g. "Tandoor"), not the display label
  value: string;
  imageUrl: string;
}

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=240&h=240&q=70`;

const POPULAR_CUISINES: CuisineItem[] = [
  { label: "Biryani", value: "Biryani", imageUrl: img("photo-1589302168068-964664d93dc0") },
  { label: "North Indian", value: "North Indian", imageUrl: img("photo-1603894584373-5ac82b2ae398") },
  { label: "South Indian", value: "South Indian", imageUrl: img("photo-1630383249896-424e482df921") },
  { label: "Burgers", value: "Burgers", imageUrl: img("photo-1568901346375-23c9450c58cd") },
  { label: "Tandoori", value: "Tandoor", imageUrl: img("photo-1599487488170-d11ec9c172f0") },
  { label: "Mithai", value: "Mithai", imageUrl: img("photo-1601050690597-df0568f70950") },
  { label: "Street food", value: "Street Food", imageUrl: img("photo-1546833999-b9f581a1996d") },
  { label: "Pizza", value: "Pizza", imageUrl: img("photo-1513104890138-7c749659a591") },
];

export function CuisineRail({ selectedCuisine, onSelectCuisine }: { selectedCuisine?: string; onSelectCuisine: (cuisine: string | undefined) => void }) {
  const selected = POPULAR_CUISINES.find((c) => c.value === selectedCuisine);
  return (
    <section aria-label="Cuisines">
      <div className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:gap-7 sm:px-0">
        {POPULAR_CUISINES.map((item) => {
          const isSelected = selected?.value === item.value;
          return (
            <button
              key={item.value}
              onClick={() => onSelectCuisine(isSelected ? undefined : item.value)}
              aria-pressed={isSelected}
              className="group flex w-[72px] shrink-0 flex-col items-center gap-3 sm:w-[88px]"
            >
              <span
                className={`block h-[72px] w-[72px] overflow-hidden rounded-full ring-offset-2 transition sm:h-[88px] sm:w-[88px] ${
                  isSelected ? "ring-2 ring-ink" : selected ? "opacity-50 group-hover:opacity-100" : ""
                }`}
              >
                <SafeImage src={item.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              </span>
              <span className={`text-[13px] leading-tight ${isSelected ? "font-semibold text-ink" : "text-ink-soft group-hover:text-ink"}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function cuisineLabel(value?: string): string | undefined {
  return POPULAR_CUISINES.find((c) => c.value === value)?.label ?? value;
}

"use client";

import React from "react";
import Image from "next/image";

export interface CuisineItem {
  id: string;
  name: string;
  imageUrl: string;
}

const POPULAR_CUISINES: CuisineItem[] = [
  {
    id: "biryani",
    name: "Biryani",
    imageUrl: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "north-indian",
    name: "North Indian",
    imageUrl: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "pizza",
    name: "Pizza",
    imageUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "burgers",
    name: "Burgers",
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "tandoor",
    name: "Tandoori",
    imageUrl: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "sweets",
    name: "Mithai",
    imageUrl: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "chaat",
    name: "Street Food",
    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "rolls",
    name: "Kathi Rolls",
    imageUrl: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=300&q=80",
  },
];

interface CuisineRailProps {
  selectedCuisine?: string;
  onSelectCuisine: (cuisine: string | undefined) => void;
}

export function CuisineRail({ selectedCuisine, onSelectCuisine }: CuisineRailProps) {
  return (
    <div className="py-6">
      <h3 className="text-xl font-bold text-text-primary tracking-tight mb-4">
        Inspiration for your first order
      </h3>
      <div className="flex items-center gap-6 overflow-x-auto pb-4 scrollbar-none">
        {POPULAR_CUISINES.map((item) => {
          const isSelected = selectedCuisine?.toLowerCase() === item.name.toLowerCase();
          return (
            <button
              key={item.id}
              onClick={() => onSelectCuisine(isSelected ? undefined : item.name)}
              className="flex flex-col items-center gap-2 group shrink-0 focus:outline-none"
            >
              <div
                className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 transition-all shadow-sm group-hover:shadow-md group-hover:scale-105 ${
                  isSelected ? "border-brand ring-4 ring-brand/20 scale-105" : "border-border"
                }`}
              >
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span
                className={`text-xs font-semibold tracking-tight transition-colors ${
                  isSelected ? "text-brand font-bold" : "text-text-primary group-hover:text-brand"
                }`}
              >
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

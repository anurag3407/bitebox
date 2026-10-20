"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { EmptyState, SafeImage, VegMark } from "@/components/ui/misc";
import { useLocationStore } from "@/features/location/location-store";
import { useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const SUGGESTIONS = ["Biryani", "Paneer", "Burger", "Dosa", "Chaat", "Butter Chicken"];

function SearchContent() {
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const location = useLocationStore((s) => s.location);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [vegOnly, setVegOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
      router.replace(input.trim() ? `/search?q=${encodeURIComponent(input.trim())}` : "/search", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [input, router]);

  const results = useQuery({
    queryKey: ["search", query, location, vegOnly],
    queryFn: () => api.search(query, location ?? undefined, vegOnly),
    enabled: query.length >= 2,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="relative">
        <Search className="w-5 h-5 text-text-secondary absolute left-4 top-3.5" />
        <input
          autoFocus
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search for dishes or restaurants"
          aria-label="Search"
          className="w-full pl-12 pr-4 py-3 bg-surface-muted border border-border rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div className="flex gap-2 mt-3 overflow-x-auto">
        <button
          onClick={() => setVegOnly(!vegOnly)}
          aria-pressed={vegOnly}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${vegOnly ? "bg-success-light text-success border-success" : "border-border"}`}
        >
          <VegMark tag="VEG" /> Veg only
        </button>
        {query.length < 2 &&
          SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => setInput(s)} className="shrink-0 px-3 py-1.5 rounded-full border border-border text-xs font-semibold hover:bg-surface-muted">
              {s}
            </button>
          ))}
      </div>

      {query.length >= 2 && (
        <div className="mt-6 space-y-8">
          {results.isPending ? (
            <div className="h-40 bg-surface-muted rounded-2xl animate-pulse" />
          ) : !results.data?.restaurants.length && !results.data?.dishes.length ? (
            <EmptyState title={`No results for “${query}”`} body={location ? "Nothing that delivers to your location matches. Try another dish." : "Try a different spelling or dish."} />
          ) : (
            <>
              {results.data.restaurants.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold mb-3">Restaurants</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {results.data.restaurants.map((r) => (
                      <RestaurantCard key={r.id} restaurant={r} />
                    ))}
                  </div>
                </section>
              )}
              {results.data.dishes.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold mb-3">Dishes</h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {results.data.dishes.map(({ dish, restaurant }) => (
                      <li key={dish.id}>
                        <Link href={`/restaurants/${restaurant.slug}`} className={`flex gap-3 p-3 rounded-2xl border border-border hover:shadow-md ${!dish.isAvailable ? "opacity-60" : ""}`}>
                          <SafeImage src={dish.imageUrl} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <VegMark tag={dish.dietaryTag} />
                              <p className="font-bold text-sm truncate">{dish.name}</p>
                            </div>
                            <p className="text-xs font-semibold mt-0.5">{formatRupees(dish.pricePaise)}</p>
                            <p className="text-xs text-text-secondary truncate">from {restaurant.name}</p>
                            {!dish.isAvailable && <p className="text-[11px] font-bold text-red-700">Sold out</p>}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}

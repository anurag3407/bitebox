"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { RestaurantCard, RestaurantCardSkeleton } from "@/components/discovery/RestaurantCard";
import { EmptyState, SafeImage, VegMark } from "@/components/ui/misc";
import { useLocationStore } from "@/features/location/location-store";
import { useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const SUGGESTIONS = ["Biryani", "Paneer", "Burger", "Dosa", "Chaat", "Butter chicken"];

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
      const next = input.trim();
      setQuery(next);
      if (next !== (params.get("q") ?? "")) router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [input, router, params]);

  const results = useQuery({
    queryKey: ["search", query, location, vegOnly],
    queryFn: () => api.search(query, location ?? undefined, vegOnly),
    enabled: query.length >= 2,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="page pb-16 pt-8 sm:pt-14">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input
            autoFocus
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search dishes or restaurants"
            aria-label="Search"
            className="h-14 w-full rounded-full border border-line bg-white pl-14 pr-12 text-base text-ink shadow-soft outline-none transition placeholder:text-ink-muted focus:border-ink sm:h-16 sm:text-lg"
          />
          {input && (
            <button onClick={() => setInput("")} aria-label="Clear search" className="btn btn-ghost btn-icon absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 sm:right-3">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          <button onClick={() => setVegOnly(!vegOnly)} aria-pressed={vegOnly} className="chip">
            Veg only
          </button>
          {query.length < 2 &&
            SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="chip">
                {s}
              </button>
            ))}
        </div>
      </div>

      {query.length < 2 ? (
        <p className="mt-20 text-center text-sm text-ink-muted">Try a dish, a cuisine or a restaurant name.</p>
      ) : (
        <div className="mt-14 space-y-16">
          {results.isPending ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <RestaurantCardSkeleton key={n} />
              ))}
            </div>
          ) : !results.data?.restaurants.length && !results.data?.dishes.length ? (
            <EmptyState
              icon={<Search />}
              title={`No results for “${query}”`}
              body={location ? "Nothing that delivers to you matches. Try another dish." : "Check the spelling or try another dish."}
            />
          ) : (
            <>
              {results.data.dishes.length > 0 && (
                <section>
                  <h2 className="h-section">Dishes</h2>
                  <ul className="mt-6 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    {results.data.dishes.map(({ dish, restaurant }) => (
                      <li key={dish.id} className="border-b border-line">
                        <Link href={`/restaurants/${restaurant.slug}`} className={`group flex items-center gap-5 py-5 ${!dish.isAvailable ? "opacity-50" : ""}`}>
                          <SafeImage src={dish.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <VegMark tag={dish.dietaryTag} />
                              <p className="truncate font-medium text-ink group-hover:underline group-hover:underline-offset-4">{dish.name}</p>
                            </div>
                            <p className="mt-1 text-sm text-ink tabular">{formatRupees(dish.pricePaise)}</p>
                            <p className="mt-0.5 truncate text-sm text-ink-muted">
                              {restaurant.name}
                              {!dish.isAvailable && " · Sold out"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {results.data.restaurants.length > 0 && (
                <section>
                  <h2 className="h-section">Restaurants</h2>
                  <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {results.data.restaurants.map((r) => (
                      <RestaurantCard key={r.id} restaurant={r} />
                    ))}
                  </div>
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

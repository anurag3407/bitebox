"use client";

import React, { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search as SearchIcon, ArrowRight, Utensils, Store } from "lucide-react";
import { SearchResultDto } from "@startup/contracts";
import { ApiClient } from "@startup/api-client";
import { useLocationStore } from "@/features/location/location-store";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const { currentLocation } = useLocationStore();

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const client = new ApiClient({ baseUrl: "" });
        const res = await client.search(query.trim(), currentLocation);
        startTransition(() => {
          setResults(res);
        });
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentLocation]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search Bar Input */}
      <div className="max-w-2xl mx-auto mb-10">
        <div className="relative">
          <SearchIcon className="w-5 h-5 text-text-secondary absolute left-4 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for 'Butter Chicken', 'Biryani', 'Punjabi Angithi'..."
            autoFocus
            className="w-full pl-12 pr-4 py-3.5 bg-surface-muted border border-border rounded-2xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand shadow-xs transition-all"
          />
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-xs font-semibold text-text-secondary animate-pulse">
          Searching menus and outlets...
        </div>
      )}

      {results && (
        <div className="space-y-12">
          {/* 1. Matching Restaurants */}
          {results.restaurants.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-text-primary tracking-tight mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-brand" />
                <span>Matching Restaurants ({results.restaurants.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.restaurants.map((res) => (
                  <RestaurantCard key={res.id} restaurant={res} />
                ))}
              </div>
            </div>
          )}

          {/* 2. Matching Dishes */}
          {results.dishes.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-text-primary tracking-tight mb-4 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-brand" />
                <span>Matching Dishes ({results.dishes.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.dishes.map(({ dish, restaurant }) => (
                  <Link
                    key={`${dish.id}_${restaurant.id}`}
                    href={`/restaurants/${restaurant.slug}`}
                    className="p-4 bg-white rounded-2xl border border-border hover:border-brand/40 hover:shadow-md transition-all flex items-center justify-between gap-4 group"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-brand uppercase tracking-wider">
                        {restaurant.name}
                      </span>
                      <h4 className="font-bold text-sm text-text-primary group-hover:text-brand transition-colors mt-0.5">
                        {dish.name}
                      </h4>
                      <p className="text-xs font-bold text-text-primary mt-1">
                        ₹{(dish.pricePaise / 100).toFixed(0)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-bold text-brand bg-brand-light px-3 py-1.5 rounded-xl group-hover:bg-brand group-hover:text-white transition-colors shrink-0">
                      <span>View Menu</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.restaurants.length === 0 && results.dishes.length === 0 && (
            <div className="text-center py-16 bg-surface-muted rounded-2xl border border-border">
              <p className="text-sm font-bold text-text-primary">
                No results found for &quot;{query}&quot;
              </p>
              <p className="text-xs text-text-secondary mt-1">
                Try searching for generic terms like &quot;Dal&quot;, &quot;Paneer&quot;, &quot;Tandoori&quot;, or &quot;Burger&quot;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-16 text-center text-xs font-semibold text-text-secondary">
          Loading search...
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}

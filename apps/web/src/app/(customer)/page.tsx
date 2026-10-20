"use client";

import React, { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { CuisineRail } from "@/components/discovery/CuisineRail";
import { DiscoveryFilters, FilterBar } from "@/components/discovery/FilterBar";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { LocationSheet } from "@/components/location/location-sheet";
import { EmptyState } from "@/components/ui/misc";
import { useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";

const PAGE_SIZE = 12;

export default function CustomerDiscoveryPage() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const { location, label } = useLocationStore();
  const [locationOpen, setLocationOpen] = useState(false);
  const [cuisine, setCuisine] = useState<string | undefined>();
  const [filters, setFilters] = useState<DiscoveryFilters>({
    pureVeg: false,
    minRating: null,
    fastDelivery: false,
    hasOffer: false,
    sortBy: "relevance",
  });

  const query = useInfiniteQuery({
    queryKey: ["restaurants", location, cuisine, filters, isSignedIn],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.getRestaurants({
        latitude: location?.latitude,
        longitude: location?.longitude,
        cuisine,
        pureVeg: filters.pureVeg || undefined,
        minRating: filters.minRating ?? undefined,
        maxDeliveryMinutes: filters.fastDelivery ? 30 : undefined,
        hasOffer: filters.hasOffer || undefined,
        sortBy: filters.sortBy,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });

  const favorites = useQuery({
    queryKey: ["favorites", location],
    queryFn: () => api.getFavorites(location ?? undefined),
    enabled: isSignedIn,
  });

  const restaurants = query.data?.pages.flatMap((p) => p.restaurants) ?? [];
  const area = label?.split(",").slice(-2, -1)[0]?.trim() || label?.split(",")[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {!location && (
        <div className="mb-6 p-5 rounded-3xl bg-gradient-to-r from-brand to-rose-500 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black">Hungry? Tell us where to deliver.</h1>
            <p className="text-sm text-white/90">We&apos;ll show restaurants that deliver to you, with accurate times and fees.</p>
          </div>
          <button onClick={() => setLocationOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-brand rounded-xl text-sm font-bold">
            <MapPin className="w-4 h-4" /> Set location
          </button>
        </div>
      )}

      {location && (
        <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight mb-1">
          Delivering to {area ?? "your location"}
        </h1>
      )}

      {(favorites.data?.length ?? 0) > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-text-primary mb-3">Your favourites</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {favorites.data!.map((r) => (
              <div key={r.id} className="w-64 shrink-0 snap-start">
                <RestaurantCard restaurant={r} />
              </div>
            ))}
          </div>
        </section>
      )}

      <CuisineRail selectedCuisine={cuisine} onSelectCuisine={setCuisine} />
      <FilterBar filters={filters} onChange={setFilters} hasLocation={!!location} />

      <section className="mt-6">
        <h2 className="text-lg font-bold text-text-primary mb-4">
          {cuisine ? `${cuisine} near you` : location ? "Restaurants delivering to you" : "Popular restaurants"}
        </h2>

        {query.isPending ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, n) => (
              <div key={n} className="rounded-2xl border border-border h-72 animate-pulse bg-surface-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            title="Couldn't load restaurants"
            body={errorMessage(query.error)}
            action={<button onClick={() => query.refetch()} className="px-4 py-2 bg-brand text-white rounded-lg text-xs font-bold">Retry</button>}
          />
        ) : restaurants.length === 0 ? (
          <EmptyState
            title={location ? "No restaurants deliver here yet" : "No matching restaurants"}
            body={location ? "We're expanding fast. Try another address or clear filters." : "Try clearing your filters."}
            action={
              <button onClick={() => setLocationOpen(true)} className="px-4 py-2 bg-brand text-white rounded-lg text-xs font-bold">
                Change location
              </button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {restaurants.map((r) => (
                <RestaurantCard key={r.id} restaurant={r} />
              ))}
            </div>
            {query.hasNextPage && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                  className="px-6 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-surface-muted disabled:opacity-60"
                >
                  {query.isFetchingNextPage ? "Loading…" : "Show more restaurants"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, LocateFixed, MapPin, Search } from "lucide-react";
import { CuisineRail, cuisineLabel } from "@/components/discovery/CuisineRail";
import { DiscoveryFilters, FilterBar } from "@/components/discovery/FilterBar";
import { RestaurantCard, RestaurantCardSkeleton } from "@/components/discovery/RestaurantCard";
import { LocationSheet } from "@/components/location/location-sheet";
import { EmptyState } from "@/components/ui/misc";
import { useLocationStore } from "@/features/location/location-store";
import { useLocationHydrated } from "@/features/hydration";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";

const PAGE_SIZE = 12;
const DEFAULT_FILTERS: DiscoveryFilters = { pureVeg: false, minRating: null, fastDelivery: false, hasOffer: false, sortBy: "relevance" };

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, n) => (
        <RestaurantCardSkeleton key={n} />
      ))}
    </div>
  );
}

export default function CustomerDiscoveryPage() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const { location, label } = useLocationStore();
  const locationReady = useLocationHydrated();
  const [locationOpen, setLocationOpen] = useState(false);
  const [cuisine, setCuisine] = useState<string | undefined>();
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);

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
    // Wait for the saved location so we don't fetch twice and flash the wrong list
    enabled: locationReady,
  });

  const favorites = useQuery({
    queryKey: ["favorites", location],
    queryFn: () => api.getFavorites(location ?? undefined),
    enabled: isSignedIn && locationReady,
  });

  const restaurants = query.data?.pages.flatMap((p) => p.restaurants) ?? [];
  const area = label?.split(",").slice(-2, -1)[0]?.trim() || label?.split(",")[0];
  const filtered = !!cuisine || JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="page">
      {locationReady && !location ? (
        <section className="py-16 sm:py-28">
          <p className="eyebrow">Food delivery</p>
          <h1 className="h-display mt-4 max-w-3xl">Good food from around the corner, at your door.</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Tell us where you are and we&apos;ll show restaurants that deliver to you, with real delivery times and fees.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => setLocationOpen(true)} className="btn btn-primary btn-lg">
              <LocateFixed className="h-5 w-5" /> Set delivery location
            </button>
            <a href="#restaurants" className="btn btn-secondary btn-lg">
              Just browsing <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      ) : (
        <section className="pb-10 pt-10 sm:pb-12 sm:pt-16">
          <button onClick={() => setLocationOpen(true)} className="group inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
            <MapPin className="h-4 w-4" /> Delivering to <span className="font-medium text-ink underline decoration-line-strong underline-offset-4 group-hover:decoration-ink">{area ?? "your location"}</span>
          </button>
          <h1 className="h-page mt-3">What are you craving today?</h1>
        </section>
      )}

      <div className="space-y-14 sm:space-y-16">
        <CuisineRail selectedCuisine={cuisine} onSelectCuisine={setCuisine} />

        {(favorites.data?.length ?? 0) > 0 && (
          <section>
            <h2 className="h-section mb-6">Your favourites</h2>
            <div className="no-scrollbar -mx-5 flex snap-x gap-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {favorites.data!.map((r) => (
                <div key={r.id} className="w-[280px] shrink-0 snap-start">
                  <RestaurantCard restaurant={r} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="restaurants" className="scroll-mt-24">
          <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-5 mb-8 bg-white/95 px-5 py-4 backdrop-blur-xl sm:top-[calc(72px+env(safe-area-inset-top))] sm:mx-0 sm:px-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="h-section">
                {cuisine ? `${cuisineLabel(cuisine)} near you` : location ? "Restaurants near you" : "Popular restaurants"}
              </h2>
              <FilterBar filters={filters} onChange={setFilters} hasLocation={!!location} />
            </div>
          </div>

          {!locationReady || query.isPending ? (
            <SkeletonGrid />
          ) : query.isError ? (
            <EmptyState
              title="Couldn't load restaurants"
              body={errorMessage(query.error)}
              action={
                <button onClick={() => query.refetch()} className="btn btn-primary">
                  Try again
                </button>
              }
            />
          ) : restaurants.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title={filtered ? "Nothing matches those filters" : location ? "No restaurants deliver here yet" : "No restaurants yet"}
              body={filtered ? "Try removing a filter or picking another cuisine." : "We're adding kitchens every week. Try a different address."}
              action={
                filtered ? (
                  <button
                    onClick={() => {
                      setFilters(DEFAULT_FILTERS);
                      setCuisine(undefined);
                    }}
                    className="btn btn-primary"
                  >
                    Clear filters
                  </button>
                ) : (
                  <button onClick={() => setLocationOpen(true)} className="btn btn-primary">
                    Change location
                  </button>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {restaurants.map((r) => (
                  <RestaurantCard key={r.id} restaurant={r} />
                ))}
              </div>
              {query.hasNextPage && (
                <div className="mt-14 flex justify-center">
                  <button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="btn btn-outline">
                    {query.isFetchingNextPage ? "Loading…" : "Show more"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
    </div>
  );
}

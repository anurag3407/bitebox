"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers, LocateFixed, MapPin, Search, Sparkles } from "lucide-react";
import { CuisineRail, cuisineLabel } from "@/components/discovery/CuisineRail";
import { DiscoveryFilters, FilterBar } from "@/components/discovery/FilterBar";
import { RestaurantCard, RestaurantCardSkeleton } from "@/components/discovery/RestaurantCard";
import { LocationSheet } from "@/components/location/location-sheet";
import { EmptyState, SafeImage } from "@/components/ui/misc";
import { useLocationStore } from "@/features/location/location-store";
import { useLocationHydrated } from "@/features/hydration";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { useI18n } from "@/features/i18n/use-i18n";

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
  const { t } = useI18n();
  const api = useApi();
  const { isSignedIn } = useAuth();
  const { location, label } = useLocationStore();
  const locationReady = useLocationHydrated();
  const [locationOpen, setLocationOpen] = useState(false);
  const [cuisine, setCuisine] = useState<string | undefined>();
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    const stored = localStorage.getItem("bitebox_veg_only");
    if (stored !== null) setFilters((prev) => ({ ...prev, pureVeg: stored === "true" }));
  }, []);
  const updateFilters = (next: DiscoveryFilters) => {
    setFilters(next);
    localStorage.setItem("bitebox_veg_only", String(next.pureVeg));
  };

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

  const feed = useQuery({
    queryKey: ["personalized-feed", location],
    queryFn: () => api.getPersonalizedFeed(location ?? undefined),
    enabled: isSignedIn && locationReady,
  });

  const collections = useQuery({ queryKey: ["collections"], queryFn: () => api.getCollections() });

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
              <LocateFixed className="h-5 w-5" /> {t("home.setLocation")}
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
          <h1 className="h-page mt-3">{t("home.craving")}</h1>
        </section>
      )}

      <div className="space-y-14 sm:space-y-16">
        <CuisineRail selectedCuisine={cuisine} onSelectCuisine={setCuisine} />

        {(collections.data?.length ?? 0) > 0 && (
          <section>
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="h-section flex items-center gap-2">
                <Layers className="h-4 w-4" /> {t("home.collections")}
              </h2>
              <Link href="/collections" className="flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="no-scrollbar -mx-5 flex snap-x gap-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {collections.data!.map((collection) => (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.slug}`}
                  className="group relative h-40 w-[300px] shrink-0 snap-start overflow-hidden rounded-3xl bg-subtle sm:w-[340px]"
                >
                  <SafeImage
                    src={collection.imageUrl}
                    alt={collection.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/85 via-ink/20 to-transparent p-5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
                      {collection.restaurantCount} {collection.restaurantCount === 1 ? "place" : "places"}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-white">{collection.title}</h3>
                    {collection.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-white/70">{collection.subtitle}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(favorites.data?.length ?? 0) > 0 && (
          <section>
            <h2 className="h-section mb-6">{t("home.favourites")}</h2>
            <div className="no-scrollbar -mx-5 flex snap-x gap-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {favorites.data!.map((r) => (
                <div key={r.id} className="w-[280px] shrink-0 snap-start">
                  <RestaurantCard restaurant={r} />
                </div>
              ))}
            </div>
          </section>
        )}

        {(feed.data?.reorder.length ?? 0) > 0 && (
          <section>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="h-section">{t("home.orderAgain")}</h2>
                <p className="mt-1 text-sm text-ink-muted">Your recent kitchens, ready for a repeat.</p>
              </div>
            </div>
            <div className="no-scrollbar -mx-5 flex snap-x gap-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {feed.data!.reorder.map((r) => (
                <div key={r.id} className="w-[280px] shrink-0 snap-start">
                  <RestaurantCard restaurant={r} />
                </div>
              ))}
            </div>
          </section>
        )}

        {(feed.data?.recommended.length ?? 0) > 0 && (
          <section>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 h-section">
                  <Sparkles className="h-4 w-4" /> {t("home.forYou")}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">{feed.data!.headline}. New kitchens to try near you.</p>
              </div>
              {feed.data!.affinity[0] && <span className="badge badge-neutral shrink-0">{feed.data!.affinity[0].cuisine}</span>}
            </div>
            <div className="no-scrollbar -mx-5 flex snap-x gap-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {feed.data!.recommended.map((r) => (
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
                {cuisine ? `${cuisineLabel(cuisine)} near you` : location ? t("home.nearYou") : t("home.popular")}
              </h2>
              <FilterBar filters={filters} onChange={updateFilters} hasLocation={!!location} />
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

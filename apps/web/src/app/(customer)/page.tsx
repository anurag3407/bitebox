"use client";

import React, { useEffect, useState } from "react";
import { RestaurantSummaryDto } from "@startup/contracts";
import { CuisineRail } from "@/components/discovery/CuisineRail";
import { FilterBar } from "@/components/discovery/FilterBar";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { useLocationStore } from "@/features/location/location-store";
import { ApiClient } from "@startup/api-client";
import { Flame, Sparkles } from "lucide-react";

export default function CustomerDiscoveryPage() {
  const { locationLabel } = useLocationStore();
  const [restaurants, setRestaurants] = useState<RestaurantSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedCuisine, setSelectedCuisine] = useState<string | undefined>();
  const [pureVeg, setPureVeg] = useState(false);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [fastDelivery, setFastDelivery] = useState(false);
  const [hasOffer, setHasOffer] = useState(false);

  useEffect(() => {
    async function loadRestaurants() {
      setLoading(true);
      try {
        const client = new ApiClient({ baseUrl: "" });
        const list = await client.getRestaurants({
          pureVeg: pureVeg || undefined,
          cuisine: selectedCuisine,
        });
        setRestaurants(list);
      } catch (err) {
        console.error("Failed to load restaurants:", err);
      } finally {
        setLoading(false);
      }
    }

    loadRestaurants();
  }, [pureVeg, selectedCuisine]);

  // Client-side quick filters
  const filteredRestaurants = restaurants.filter((r) => {
    if (minRating && r.rating < minRating) return false;
    if (fastDelivery && r.deliveryTimeMaxMinutes > 30) return false;
    if (hasOffer && !r.offerTag) return false;
    return true;
  });

  const activeFilterCount =
    (pureVeg ? 1 : 0) +
    (minRating ? 1 : 0) +
    (fastDelivery ? 1 : 0) +
    (hasOffer ? 1 : 0) +
    (selectedCuisine ? 1 : 0);

  const clearAllFilters = () => {
    setPureVeg(false);
    setMinRating(null);
    setFastDelivery(false);
    setHasOffer(false);
    setSelectedCuisine(undefined);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 1. Header Banner */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
            Delivery Restaurants in {locationLabel.split(",")[0]}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Fresh meals prepared with love, delivered to your door in 25–35 minutes
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold shrink-0">
          <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
          <span>Surge-free pricing active</span>
        </div>
      </div>

      {/* 2. Cuisine Quick Rails */}
      <CuisineRail
        selectedCuisine={selectedCuisine}
        onSelectCuisine={setSelectedCuisine}
      />

      {/* 3. Filter Controls */}
      <FilterBar
        pureVeg={pureVeg}
        onTogglePureVeg={() => setPureVeg(!pureVeg)}
        minRating={minRating}
        onToggleRating={() => setMinRating(minRating ? null : 4.0)}
        fastDelivery={fastDelivery}
        onToggleFastDelivery={() => setFastDelivery(!fastDelivery)}
        hasOffer={hasOffer}
        onToggleOffer={() => setHasOffer(!hasOffer)}
        activeCount={activeFilterCount}
        onClearAll={clearAllFilters}
      />

      {/* 4. Restaurant Grid */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight">
            {selectedCuisine
              ? `${selectedCuisine} Places Near You`
              : "Popular Outlets"}
            <span className="text-sm font-normal text-text-secondary ml-2">
              ({filteredRestaurants.length} places)
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="rounded-2xl border border-border p-4 h-72 animate-pulse bg-surface-muted"
              />
            ))}
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="text-center py-16 bg-surface-muted rounded-2xl border border-border">
            <p className="text-base font-bold text-text-primary">
              No matching restaurants found
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Try adjusting your active filters or exploring another cuisine
            </p>
            <button
              onClick={clearAllFilters}
              className="mt-4 px-4 py-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-hover"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRestaurants.map((res) => (
              <RestaurantCard key={res.id} restaurant={res} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

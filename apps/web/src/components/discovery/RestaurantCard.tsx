"use client";

import React from "react";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { RestaurantSummaryDto } from "@startup/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { SafeImage } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { formatDistance, formatRupees } from "@/lib/format";

export function RestaurantCard({ restaurant }: { restaurant: RestaurantSummaryDto }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const [favorite, setFavorite] = React.useState(!!restaurant.isFavorite);
  const unavailable = !restaurant.isOpen || !restaurant.isAcceptingOrders;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      toast("Sign in to save favourites");
      return;
    }
    const next = !favorite;
    setFavorite(next);
    try {
      await api.setFavorite(restaurant.id, next);
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    } catch (err) {
      setFavorite(!next);
      toast(errorMessage(err), "error");
    }
  };

  const distance = formatDistance(restaurant.distanceMeters);

  return (
    <Link href={`/restaurants/${restaurant.slug}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-subtle">
        <SafeImage
          src={restaurant.heroImageUrl}
          alt={restaurant.name}
          className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${unavailable ? "grayscale" : ""}`}
        />
        {restaurant.offerTag && !unavailable && (
          <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-soft">{restaurant.offerTag}</span>
        )}
        <button
          onClick={toggleFavorite}
          aria-label={favorite ? "Remove from favourites" : "Save to favourites"}
          aria-pressed={favorite}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur transition-transform hover:scale-105"
        >
          <Heart className={`h-4 w-4 ${favorite ? "fill-accent text-accent" : "text-ink"}`} />
        </button>
        {unavailable && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 px-4 text-center backdrop-blur-[1px]">
            <span className="text-sm font-semibold text-ink">{restaurant.isOpen ? "Not taking orders right now" : "Closed"}</span>
            {restaurant.nextOpenText && <span className="mt-0.5 text-xs text-ink-soft">{restaurant.nextOpenText}</span>}
          </div>
        )}
      </div>

      <div className="px-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-base font-semibold tracking-tight text-ink">{restaurant.name}</h3>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-ink tabular">
            <Star className="h-3.5 w-3.5 fill-ink text-ink" />
            {restaurant.rating.toFixed(1)}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-ink-muted">
          {restaurant.deliveryTimeMinMinutes}–{restaurant.deliveryTimeMaxMinutes} min
          {distance && ` · ${distance}`} · {formatRupees(restaurant.avgPriceForOnePaise)} for one
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-muted">
          {restaurant.pureVeg && <span className="text-success">Pure veg · </span>}
          {restaurant.cuisines.join(", ")}
        </p>
      </div>
    </Link>
  );
}

export function RestaurantCardSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[4/3]" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded-full bg-subtle" />
      <div className="mt-2.5 h-3 w-1/2 animate-pulse rounded-full bg-subtle" />
    </div>
  );
}

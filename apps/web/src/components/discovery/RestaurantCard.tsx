"use client";

import React from "react";
import Link from "next/link";
import { Star, Clock, Heart } from "lucide-react";
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

  return (
    <Link
      href={`/restaurants/${restaurant.slug}`}
      className="group flex flex-col bg-white rounded-2xl border border-border/80 hover:border-transparent hover:shadow-xl transition-all duration-200 overflow-hidden"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-muted">
        <SafeImage
          src={restaurant.heroImageUrl}
          alt={restaurant.name}
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${unavailable ? "grayscale" : ""}`}
        />
        {restaurant.offerTag && !unavailable && (
          <div className="absolute bottom-3 left-3 bg-blue-600/95 text-white text-[11px] font-black px-2.5 py-1 rounded-md shadow-md uppercase tracking-wider">
            {restaurant.offerTag}
          </div>
        )}
        {restaurant.pureVeg && (
          <div className="absolute top-3 left-3 bg-white/95 text-success text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> PURE VEG
          </div>
        )}
        <button
          onClick={toggleFavorite}
          aria-label={favorite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={favorite}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
        >
          <Heart className={`w-4 h-4 ${favorite ? "fill-brand text-brand" : "text-text-secondary"}`} />
        </button>
        {unavailable && (
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-white text-center px-4">
            <span className="font-bold text-sm">{restaurant.isOpen ? "Not accepting orders right now" : "Currently closed"}</span>
            {restaurant.nextOpenText && <span className="text-xs mt-0.5 text-white/90">{restaurant.nextOpenText}</span>}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-1.5 flex-1 justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-base text-text-primary tracking-tight group-hover:text-brand truncate">{restaurant.name}</h3>
            <div className="flex items-center gap-1 bg-success text-white px-1.5 py-0.5 rounded-md text-xs font-black shrink-0">
              <span>{restaurant.rating.toFixed(1)}</span>
              <Star className="w-3 h-3 fill-white" />
            </div>
          </div>
          <p className="text-xs text-text-secondary truncate mt-0.5">{restaurant.cuisines.join(", ")}</p>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
          <div className="flex items-center gap-1 text-text-primary">
            <Clock className="w-3.5 h-3.5 text-brand" />
            <span>
              {restaurant.deliveryTimeMinMinutes}-{restaurant.deliveryTimeMaxMinutes} mins
            </span>
            {restaurant.distanceMeters !== undefined && <span className="text-text-secondary">· {formatDistance(restaurant.distanceMeters)}</span>}
          </div>
          <span>{formatRupees(restaurant.avgPriceForOnePaise)} for one</span>
        </div>
      </div>
    </Link>
  );
}

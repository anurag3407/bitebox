import React from "react";
import Link from "next/link";
import { Star, Clock, MapPin } from "lucide-react";
import { RestaurantSummaryDto } from "@startup/contracts";

interface RestaurantCardProps {
  restaurant: RestaurantSummaryDto;
}

export function RestaurantCard({ restaurant }: RestaurantCardProps) {
  const avgPriceRupees = Math.round(restaurant.avgPriceForOnePaise / 100);

  return (
    <Link
      href={`/restaurants/${restaurant.slug}`}
      className="group flex flex-col bg-white rounded-2xl border border-border/80 hover:border-transparent hover:shadow-xl transition-all duration-200 overflow-hidden"
    >
      {/* 1. Restaurant Hero Image & Offer Overlay */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-muted">
        <img
          src={
            restaurant.heroImageUrl ||
            "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80"
          }
          alt={restaurant.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Offer Tag Badge */}
        {restaurant.offerTag && (
          <div className="absolute bottom-3 left-3 bg-blue-600/95 backdrop-blur-sm text-white text-[11px] font-black px-2.5 py-1 rounded-md shadow-md uppercase tracking-wider">
            {restaurant.offerTag}
          </div>
        )}

        {/* Pure Veg Badge */}
        {restaurant.pureVeg && (
          <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-success text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            PURE VEG
          </div>
        )}

        {/* Closed or Not Accepting Banner */}
        {(!restaurant.isOpen || !restaurant.isAcceptingOrders) && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white font-bold text-sm">
            Currently Not Accepting Orders
          </div>
        )}
      </div>

      {/* 2. Restaurant Content & Metadata */}
      <div className="p-4 flex flex-col gap-1.5 flex-1 justify-between">
        <div>
          {/* Title and Rating Row */}
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-base text-text-primary tracking-tight group-hover:text-brand transition-colors truncate">
              {restaurant.name}
            </h4>
            <div className="flex items-center gap-1 bg-success text-white px-1.5 py-0.5 rounded-md text-xs font-black shrink-0 shadow-xs">
              <span>{restaurant.rating.toFixed(1)}</span>
              <Star className="w-3 h-3 fill-white" />
            </div>
          </div>

          {/* Cuisines Subtitle */}
          <p className="text-xs text-text-secondary truncate mt-0.5">
            {restaurant.cuisines.join(", ")}
          </p>
        </div>

        {/* Time, Distance & Price Row */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
          <div className="flex items-center gap-1 text-text-primary">
            <Clock className="w-3.5 h-3.5 text-brand" />
            <span>
              {restaurant.deliveryTimeMinMinutes}-{restaurant.deliveryTimeMaxMinutes} mins
            </span>
          </div>

          <span>₹{avgPriceRupees} for one</span>
        </div>
      </div>
    </Link>
  );
}

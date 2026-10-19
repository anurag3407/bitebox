"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Star,
  Clock,
  MapPin,
  Sparkles,
  Plus,
  Minus,
  Check,
  Search,
  AlertCircle,
} from "lucide-react";
import { MenuItemDto, RestaurantDetailDto } from "@startup/contracts";
import { ApiClient } from "@startup/api-client";
import { useCartStore } from "@/features/cart/cart-store";
import { ItemCustomizerModal } from "@/components/menu/ItemCustomizerModal";

export default function RestaurantMenuPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();

  const [restaurant, setRestaurant] = useState<RestaurantDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);

  // Customization modal state
  const [customizingItem, setCustomizingItem] = useState<MenuItemDto | null>(null);

  const cart = useCartStore();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const client = new ApiClient({ baseUrl: "" });
        const data = await client.getRestaurantBySlug(slug);
        setRestaurant(data);
        if (data.categories[0]) {
          setActiveCategoryId(data.categories[0].id);
        }
      } catch (err) {
        console.error("Failed to load restaurant menu:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
        <div className="h-48 bg-surface-muted rounded-3xl mb-6" />
        <div className="h-10 bg-surface-muted rounded-xl w-64 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-surface-muted rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-surface-muted rounded-3xl border border-border">
        <AlertCircle className="w-12 h-12 text-brand mx-auto mb-3" />
        <h2 className="text-xl font-bold text-text-primary">Restaurant not found</h2>
        <p className="text-xs text-text-secondary mt-1 mb-6">
          The requested restaurant is either inactive or does not exist.
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl"
        >
          Back to Discovery
        </button>
      </div>
    );
  }

  const handleAddItem = (item: MenuItemDto) => {
    // If item has variants or modifier groups, open customizer modal
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setCustomizingItem(item);
      return;
    }

    // Direct add for simple items
    const res = cart.addItem({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      menuItemId: item.id,
      name: item.name,
      basePricePaise: item.pricePaise,
      quantity: 1,
      imageUrl: item.imageUrl,
    });

    if (!res.success) {
      if (
        confirm(
          `Your cart contains items from "${res.conflictRestaurantName}". Would you like to clear your cart and start a fresh order from "${restaurant.name}"?`
        )
      ) {
        cart.clearCart();
        cart.addItem({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          restaurantSlug: restaurant.slug,
          menuItemId: item.id,
          name: item.name,
          basePricePaise: item.pricePaise,
          quantity: 1,
          imageUrl: item.imageUrl,
        });
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
      {/* 1. Restaurant Header Hero */}
      <div className="bg-white rounded-3xl border border-border p-6 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">
                {restaurant.name}
              </h1>
              {restaurant.pureVeg && (
                <span className="text-[10px] font-bold text-success bg-success-light px-2.5 py-0.5 rounded-full border border-success/30">
                  PURE VEG
                </span>
              )}
            </div>

            <p className="text-sm text-text-secondary mb-2">{restaurant.cuisines.join(", ")}</p>
            <p className="text-xs text-text-secondary flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-text-secondary" />
              <span>{restaurant.addressText}</span>
            </p>

            {/* Offer Callout */}
            {restaurant.offerTag && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-brand-light text-brand rounded-lg text-xs font-bold border border-brand/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{restaurant.offerTag}</span>
              </div>
            )}
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1 bg-success text-white px-2 py-0.5 rounded-md text-xs font-black shadow-xs">
                <span>{restaurant.rating.toFixed(1)}</span>
                <Star className="w-3 h-3 fill-white" />
              </div>
              <span className="text-[10px] text-text-secondary mt-1 font-medium">
                {restaurant.ratingCount}+ ratings
              </span>
            </div>

            <div className="h-8 w-px bg-border" />

            <div>
              <div className="flex items-center gap-1 text-sm font-bold text-text-primary">
                <Clock className="w-4 h-4 text-brand" />
                <span>
                  {restaurant.deliveryTimeMinMinutes}-{restaurant.deliveryTimeMaxMinutes}m
                </span>
              </div>
              <span className="text-[10px] text-text-secondary">Delivery Time</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Menu Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="w-full sm:max-w-xs relative">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            placeholder="Search within menu..."
            className="w-full pl-9 pr-3 py-2 bg-surface-muted border border-border rounded-xl text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>

        <button
          onClick={() => setVegOnly(!vegOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
            vegOnly
              ? "bg-success-light text-success border-success"
              : "bg-white text-text-primary border-border hover:bg-surface-muted"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-sm border border-success flex items-center justify-center p-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
          </span>
          <span>Veg Only</span>
        </button>
      </div>

      {/* 3. Category Nav Rails & Dish Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sticky Desktop Category Rail */}
        <aside className="hidden lg:block col-span-1">
          <div className="sticky top-24 space-y-1 p-3 bg-surface-muted rounded-2xl border border-border">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider px-2 py-1">
              Menu Categories
            </h3>
            {restaurant.categories.map((cat) => (
              <a
                key={cat.id}
                href={`#cat-${cat.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: "smooth" });
                  setActiveCategoryId(cat.id);
                }}
                className={`block px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeCategoryId === cat.id
                    ? "bg-brand text-white shadow-xs font-bold"
                    : "text-text-primary hover:bg-white"
                }`}
              >
                {cat.name} ({cat.items.length})
              </a>
            ))}
          </div>
        </aside>

        {/* Dish Catalog */}
        <div className="lg:col-span-3 space-y-10">
          {restaurant.categories.map((cat) => {
            const visibleItems = cat.items.filter((item) => {
              if (vegOnly && item.dietaryTag !== "VEG") return false;
              if (
                menuSearch &&
                !item.name.toLowerCase().includes(menuSearch.toLowerCase()) &&
                !item.description?.toLowerCase().includes(menuSearch.toLowerCase())
              ) {
                return false;
              }
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-28">
                <h3 className="text-xl font-bold text-text-primary tracking-tight mb-4 pb-2 border-b border-border flex items-center justify-between">
                  <span>{cat.name}</span>
                  <span className="text-xs font-normal text-text-secondary">
                    {visibleItems.length} items
                  </span>
                </h3>

                <div className="divide-y divide-border">
                  {visibleItems.map((item) => {
                    const priceRupees = (item.pricePaise / 100).toFixed(0);
                    const isVeg = item.dietaryTag === "VEG";
                    const isCustomizable =
                      item.variants.length > 0 || item.modifierGroups.length > 0;

                    return (
                      <div
                        key={item.id}
                        className="py-5 flex items-start justify-between gap-4 group"
                      >
                        <div className="flex-1 pr-4">
                          {/* Dietary Badge */}
                          <div
                            className={`w-3.5 h-3.5 rounded-xs border p-0.5 flex items-center justify-center mb-1.5 ${
                              isVeg ? "border-success" : "border-red-600"
                            }`}
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isVeg ? "bg-success" : "bg-red-600"
                              }`}
                            />
                          </div>

                          <h4 className="font-bold text-sm text-text-primary group-hover:text-brand transition-colors">
                            {item.name}
                          </h4>

                          <p className="text-xs font-bold text-text-primary mt-0.5">
                            ₹{priceRupees}
                          </p>

                          {item.description && (
                            <p className="text-xs text-text-secondary line-clamp-2 mt-1 max-w-lg leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Image & Add Button */}
                        <div className="relative flex flex-col items-center shrink-0">
                          {item.imageUrl ? (
                            <div className="w-28 h-24 sm:w-32 sm:h-28 rounded-2xl overflow-hidden bg-surface-muted border border-border shadow-xs">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                            </div>
                          ) : (
                            <div className="w-28 h-16 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-[10px] text-text-secondary">
                              Fresh Food
                            </div>
                          )}

                          <button
                            onClick={() => handleAddItem(item)}
                            className="absolute -bottom-3 px-6 py-1.5 bg-white hover:bg-brand-light text-brand border border-brand/30 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1 active:scale-95"
                          >
                            <span>ADD</span>
                            <Plus className="w-3.5 h-3.5 text-brand" />
                          </button>

                          {isCustomizable && (
                            <span className="text-[9px] text-text-secondary font-medium mt-4">
                              Customisable
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Item Customizer Modal */}
      {customizingItem && (
        <ItemCustomizerModal
          item={customizingItem}
          isOpen={true}
          onClose={() => setCustomizingItem(null)}
          onConfirm={(customization) => {
            const res = cart.addItem({
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              restaurantSlug: restaurant.slug,
              menuItemId: customizingItem.id,
              name: customizingItem.name,
              variantId: customization.variantId,
              variantName: customization.variantName,
              selectedOptions: customization.selectedOptions,
              basePricePaise: customization.basePricePaise,
              quantity: customization.quantity,
              instructions: customization.instructions,
              imageUrl: customizingItem.imageUrl,
            });

            if (!res.success) {
              if (
                confirm(
                  `Your cart contains items from "${res.conflictRestaurantName}". Clear cart and start new order?`
                )
              ) {
                cart.clearCart();
                cart.addItem({
                  restaurantId: restaurant.id,
                  restaurantName: restaurant.name,
                  restaurantSlug: restaurant.slug,
                  menuItemId: customizingItem.id,
                  name: customizingItem.name,
                  variantId: customization.variantId,
                  variantName: customization.variantName,
                  selectedOptions: customization.selectedOptions,
                  basePricePaise: customization.basePricePaise,
                  quantity: customization.quantity,
                  instructions: customization.instructions,
                  imageUrl: customizingItem.imageUrl,
                });
              }
            }
          }}
        />
      )}
    </div>
  );
}

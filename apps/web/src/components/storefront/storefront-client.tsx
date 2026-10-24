"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RestaurantDetailDto } from "@startup/contracts";
import { useCartStore } from "@/features/cart/cart-store";
import { useToast } from "@/components/ui/toast";
import { SafeImage, VegMark } from "@/components/ui/misc";

function rupees(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}

export function StorefrontClient({ restaurant, token }: { restaurant: RestaurantDetailDto; token?: string }) {
  const toast = useToast();
  const addItem = useCartStore((s) => s.addItem);
  const count = useCartStore((s) => s.getItemCount());
  const subtotal = useCartStore((s) => s.getSubtotalPaise());
  const [directActive, setDirectActive] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/v1/attribution/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, slug: restaurant.slug, sourceType: "STOREFRONT_SLUG" }),
    })
      .then((res) => {
        if (!cancelled) setDirectActive(res.ok);
      })
      .catch(() => {
        if (!cancelled) setDirectActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, restaurant.slug]);

  const add = (item: RestaurantDetailDto["categories"][number]["items"][number]) => {
    const result = addItem({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      menuItemId: item.id,
      name: item.name,
      basePricePaise: item.pricePaise,
      quantity: 1,
      imageUrl: item.imageUrl ?? undefined,
      isVeg: item.dietaryTag === "VEG" || item.dietaryTag === "VEGAN",
    });
    if (!result.success) {
      toast(result.conflictRestaurantName ? `Your cart has items from ${result.conflictRestaurantName}.` : result.reason ?? "Could not add this item.", "error");
      return;
    }
    toast(`${item.name} added`, "success");
  };

  return (
    <main className="min-h-screen bg-surface-muted pb-28">
      <header className="bg-white border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-bold text-text-secondary hover:text-brand">
            ← Marketplace
          </Link>
          <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${directActive ? "bg-success-light text-success" : "bg-amber-50 text-amber-700"}`}>
            {directActive ? "DIRECT ORDER ACTIVE" : "DIRECT LINK"}
          </span>
        </div>
      </header>

      <section className="bg-white border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex gap-4 items-start">
            <SafeImage src={restaurant.heroImageUrl ?? undefined} alt={restaurant.name} className="w-24 h-24 rounded-2xl object-cover shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-text-primary leading-tight">{restaurant.name}</h1>
              <p className="text-sm text-text-secondary mt-1">{restaurant.cuisines.join(" · ")}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-semibold text-text-secondary">
                <span className="text-amber-700">★ {restaurant.rating.toFixed(1)}</span>
                <span>·</span>
                <span>{restaurant.deliveryTimeMinMinutes}–{restaurant.deliveryTimeMaxMinutes} min</span>
                <span>·</span>
                <span>{restaurant.addressText}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-brand-light border border-brand/20 px-4 py-3">
            <p className="text-sm font-black text-brand">Ordering direct from {restaurant.name}</p>
            <p className="text-xs text-text-secondary mt-0.5">
              0% restaurant commission. Menu prices stay with the kitchen — your delivery and platform fees are shown at checkout.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {restaurant.categories.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-10">The menu is being updated.</p>
        )}
        {restaurant.categories.map((category) => (
          <section key={category.id}>
            <h2 className="text-lg font-black text-text-primary mb-2">{category.name}</h2>
            <ul className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden">
              {category.items.map((item) => {
                const customisable = item.variants.length > 0 || item.modifierGroups.length > 0;
                return (
                  <li key={item.id} className={`p-4 flex gap-4 ${item.isAvailable ? "" : "opacity-50"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <VegMark tag={item.dietaryTag} />
                        {item.isBestseller && (
                          <span className="text-[9px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">BESTSELLER</span>
                        )}
                      </div>
                      <h3 className="font-bold text-text-primary mt-1">{item.name}</h3>
                      <p className="text-sm font-semibold text-text-primary">{rupees(item.pricePaise)}</p>
                      {item.description && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{item.description}</p>}
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-2">
                      <SafeImage src={item.imageUrl ?? undefined} alt={item.name} className="w-24 h-20 rounded-xl object-cover" />
                      {item.isAvailable ? (
                        customisable ? (
                          <Link
                            href={`/restaurants/${restaurant.slug}`}
                            className="text-[11px] font-black text-brand border border-brand rounded-lg px-3 py-1.5 hover:bg-brand-light"
                          >
                            CUSTOMISE
                          </Link>
                        ) : (
                          <button
                            onClick={() => add(item)}
                            className="text-[11px] font-black text-brand border border-brand rounded-lg px-3 py-1.5 hover:bg-brand-light"
                          >
                            ADD
                          </button>
                        )
                      ) : (
                        <span className="text-[10px] font-bold text-text-secondary">SOLD OUT</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {count > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-secondary">{count} item{count === 1 ? "" : "s"} · {restaurant.name}</p>
              <p className="text-base font-black text-text-primary">{rupees(subtotal)}</p>
            </div>
            <Link href="/checkout" className="bg-brand text-white text-sm font-black rounded-xl px-5 py-3 hover:bg-brand-hover">
              Checkout
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

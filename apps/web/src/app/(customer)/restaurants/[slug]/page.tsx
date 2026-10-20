"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Star, Clock, MapPin, Sparkles, Search, AlertCircle, Share2, Award } from "lucide-react";
import { MenuItemDto, RestaurantDetailDto } from "@startup/contracts";
import { AddItemInput, useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { ItemCustomizerModal } from "@/components/menu/ItemCustomizerModal";
import { Modal } from "@/components/ui/modal";
import { SafeImage, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ApiError, useApi } from "@/lib/api";
import { formatRupees, timeAgo } from "@/lib/format";

function QuantityControl({
  item,
  restaurant,
  onCustomize,
  onConflict,
}: {
  item: MenuItemDto;
  restaurant: RestaurantDetailDto;
  onCustomize: () => void;
  onConflict: (pending: AddItemInput, otherRestaurant: string) => void;
}) {
  const toast = useToast();
  const cart = useCartStore();
  const isCustomisable = item.variants.length > 0 || item.modifierGroups.length > 0;
  const quantity = cart.getQuantityOf(item.id);
  const simpleLine = cart.items.find((l) => l.menuItemId === item.id && !l.variantId && l.selectedOptionIds.length === 0);
  const disabled = !item.isAvailable || !restaurant.isAcceptingOrders;

  const add = () => {
    if (isCustomisable) return onCustomize();
    const input: AddItemInput = {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      menuItemId: item.id,
      name: item.name,
      basePricePaise: item.pricePaise,
      quantity: 1,
      imageUrl: item.imageUrl,
      isVeg: item.dietaryTag === "VEG" || item.dietaryTag === "VEGAN",
    };
    const res = cart.addItem(input);
    if (res.conflictRestaurantName) onConflict(input, res.conflictRestaurantName);
    else if (!res.success && res.reason) toast(res.reason, "error");
  };

  if (disabled) {
    return <span className="text-[11px] font-bold text-text-secondary bg-surface-muted px-3 py-2 rounded-lg">{item.isAvailable ? "Unavailable" : "Sold out"}</span>;
  }

  if (quantity > 0 && (simpleLine || isCustomisable)) {
    return (
      <div className="flex items-center bg-white border border-brand/40 rounded-lg shadow-sm text-brand font-black">
        <button
          aria-label={`Remove one ${item.name}`}
          className="px-3 py-1.5"
          onClick={() => {
            // Customised dishes are edited from the cart, where each variant is its own line
            if (simpleLine) cart.updateQuantity(simpleLine.lineId, simpleLine.quantity - 1);
            else toast("Edit customised items from your cart");
          }}
        >
          −
        </button>
        <span className="px-1 text-sm min-w-5 text-center">{quantity}</span>
        <button aria-label={`Add one ${item.name}`} className="px-3 py-1.5" onClick={add}>
          +
        </button>
      </div>
    );
  }

  return (
    <button onClick={add} className="px-6 py-1.5 bg-white border border-brand/40 text-brand font-black text-sm rounded-lg shadow-sm hover:bg-brand-light">
      ADD
    </button>
  );
}

export default function RestaurantMenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const cart = useCartStore();
  const location = useLocationStore((s) => s.location);
  const [menuSearch, setMenuSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellersOnly, setBestsellersOnly] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItemDto | null>(null);
  const [conflict, setConflict] = useState<{ pending: AddItemInput; other: string } | null>(null);

  const restaurantQuery = useQuery({ queryKey: ["restaurant", slug], queryFn: () => api.getRestaurantBySlug(slug) });
  const restaurant = restaurantQuery.data;
  const reviews = useQuery({ queryKey: ["reviews", slug], queryFn: () => api.getRestaurantReviews(slug), enabled: !!restaurant });
  const serviceability = useQuery({
    queryKey: ["serviceability", restaurant?.id, location],
    queryFn: () => api.checkServiceability(location!, restaurant!.id),
    enabled: !!restaurant && !!location,
  });

  const categories = useMemo(() => {
    if (!restaurant) return [];
    const q = menuSearch.trim().toLowerCase();
    return restaurant.categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            (!vegOnly || item.dietaryTag === "VEG" || item.dietaryTag === "VEGAN") &&
            (!bestsellersOnly || item.isBestseller) &&
            (!q || item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q))
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [restaurant, menuSearch, vegOnly, bestsellersOnly]);

  if (restaurantQuery.isPending) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse space-y-4">
        <div className="h-48 bg-surface-muted rounded-3xl" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-surface-muted rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!restaurant) {
    const notFound = restaurantQuery.error instanceof ApiError && restaurantQuery.error.status === 404;
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-surface-muted rounded-3xl border border-border">
        <AlertCircle className="w-12 h-12 text-brand mx-auto mb-3" />
        <h1 className="text-xl font-bold">{notFound ? "Restaurant not found" : "Couldn't load the menu"}</h1>
        <button onClick={() => (notFound ? router.push("/") : restaurantQuery.refetch())} className="mt-6 px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl">
          {notFound ? "Back to restaurants" : "Retry"}
        </button>
      </div>
    );
  }

  const deliversHere = serviceability.data?.isServiceable;
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: restaurant.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied", "success");
      }
    } catch {
      // user cancelled the share sheet
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28">
      <div className="relative rounded-3xl overflow-hidden mb-4 aspect-[3/1] bg-surface-muted">
        <SafeImage src={restaurant.heroImageUrl} alt={restaurant.name} className="w-full h-full object-cover" />
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-text-primary tracking-tight">{restaurant.name}</h1>
            {restaurant.pureVeg && <span className="text-[10px] font-bold text-success bg-success-light px-2.5 py-0.5 rounded-full border border-success/30">PURE VEG</span>}
          </div>
          <p className="text-sm text-text-secondary">{restaurant.cuisines.join(", ")}</p>
          <p className="text-xs text-text-secondary flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" /> {restaurant.addressText}
          </p>
          {restaurant.offerTag && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-brand-light text-brand rounded-lg text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" /> {restaurant.offerTag}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="inline-flex items-center gap-1 bg-success text-white px-2 py-0.5 rounded-md text-sm font-black">
              {restaurant.rating.toFixed(1)} <Star className="w-3 h-3 fill-white" />
            </div>
            <p className="text-[10px] text-text-secondary mt-1">{restaurant.ratingCount.toLocaleString("en-IN")} ratings</p>
          </div>
          <div className="text-center">
            <p className="flex items-center gap-1 text-sm font-bold">
              <Clock className="w-4 h-4 text-brand" />
              {serviceability.data?.estimatedDeliveryMinutes
                ? `${serviceability.data.estimatedDeliveryMinutes} min`
                : `${restaurant.deliveryTimeMinMinutes}-${restaurant.deliveryTimeMaxMinutes} min`}
            </p>
            <p className="text-[10px] text-text-secondary">Delivery time</p>
          </div>
          <button onClick={share} aria-label="Share restaurant" className="p-2 rounded-full border border-border hover:bg-surface-muted">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!restaurant.isAcceptingOrders && (
        <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold">
          {restaurant.isOpen ? "This restaurant is not accepting orders right now." : `This restaurant is closed. ${restaurant.nextOpenText ?? ""}`}
        </div>
      )}
      {location && serviceability.data && !deliversHere && (
        <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">
          {serviceability.data.reason ?? "This restaurant does not deliver to your selected location."}
        </div>
      )}

      <div className="sticky top-16 z-20 bg-white py-3 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-2.5" />
            <input
              type="search"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search in menu"
              aria-label="Search in menu"
              className="w-full pl-9 pr-3 py-2 bg-surface-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <button
            onClick={() => setVegOnly(!vegOnly)}
            aria-pressed={vegOnly}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${vegOnly ? "bg-success-light text-success border-success" : "border-border"}`}
          >
            <VegMark tag="VEG" /> Veg
          </button>
          <button
            onClick={() => setBestsellersOnly(!bestsellersOnly)}
            aria-pressed={bestsellersOnly}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1 ${bestsellersOnly ? "bg-brand-light text-brand border-brand" : "border-border"}`}
          >
            <Award className="w-3.5 h-3.5" /> Bestseller
          </button>
        </div>
        <nav className="flex gap-2 overflow-x-auto" aria-label="Menu categories">
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#cat-${cat.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="shrink-0 px-3 py-1.5 rounded-full bg-surface-muted text-xs font-semibold hover:bg-brand-light hover:text-brand"
            >
              {cat.name} ({cat.items.length})
            </a>
          ))}
        </nav>
      </div>

      <div className="space-y-10 mt-6">
        {categories.length === 0 && <p className="text-center text-sm text-text-secondary py-10">No dishes match your filters.</p>}
        {categories.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-40">
            <h2 className="text-lg font-black text-text-primary mb-2">{cat.name}</h2>
            <ul className="divide-y divide-border">
              {cat.items.map((item) => (
                <li key={item.id} className={`py-5 flex gap-4 ${!item.isAvailable ? "opacity-60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <VegMark tag={item.dietaryTag} />
                      {item.isBestseller && <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">BESTSELLER</span>}
                    </div>
                    <h3 className="font-bold text-text-primary mt-1">{item.name}</h3>
                    <p className="text-sm font-semibold text-text-primary">
                      {item.variants.length > 0 ? `from ${formatRupees(Math.min(...item.variants.map((v) => v.pricePaise)))}` : formatRupees(item.pricePaise)}
                    </p>
                    {item.description && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{item.description}</p>}
                  </div>
                  <div className="relative w-32 shrink-0 flex flex-col items-center">
                    <SafeImage src={item.imageUrl} alt={item.name} className="w-32 h-28 rounded-xl object-cover" />
                    <div className="-mt-5">
                      <QuantityControl
                        item={item}
                        restaurant={restaurant}
                        onCustomize={() => setCustomizingItem(item)}
                        onConflict={(pending, other) => setConflict({ pending, other })}
                      />
                    </div>
                    {(item.variants.length > 0 || item.modifierGroups.length > 0) && item.isAvailable && (
                      <span className="text-[10px] text-text-secondary mt-1">customisable</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {(reviews.data?.length ?? 0) > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-black mb-3">What people are saying</h2>
          <ul className="space-y-3">
            {reviews.data!.map((r) => (
              <li key={r.id} className="p-4 rounded-2xl border border-border">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-0.5 bg-success text-white px-1.5 rounded text-xs font-black">
                    {r.foodRating} <Star className="w-3 h-3 fill-white" />
                  </span>
                  <span className="font-semibold">{r.customerName}</span>
                  <span className="text-xs text-text-secondary">· {timeAgo(r.createdAt)}</span>
                </div>
                {r.comment && <p className="text-sm text-text-secondary mt-1.5">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {customizingItem && (
        <ItemCustomizerModal
          item={customizingItem}
          isOpen
          onClose={() => setCustomizingItem(null)}
          onConfirm={(c) => {
            const input: AddItemInput = {
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              restaurantSlug: restaurant.slug,
              menuItemId: customizingItem.id,
              name: customizingItem.name,
              variantId: c.variantId,
              variantName: c.variantName,
              selectedOptions: c.selectedOptions,
              basePricePaise: c.basePricePaise,
              quantity: c.quantity,
              instructions: c.instructions,
              imageUrl: customizingItem.imageUrl,
              isVeg: customizingItem.dietaryTag === "VEG" || customizingItem.dietaryTag === "VEGAN",
            };
            const res = cart.addItem(input);
            if (res.conflictRestaurantName) setConflict({ pending: input, other: res.conflictRestaurantName });
            else if (!res.success && res.reason) toast(res.reason, "error");
          }}
        />
      )}

      <Modal
        open={!!conflict}
        onClose={() => setConflict(null)}
        size="sm"
        title="Start a new cart?"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setConflict(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold">
              Keep current
            </button>
            <button
              onClick={() => {
                if (conflict) cart.replaceWith([conflict.pending]);
                setConflict(null);
              }}
              className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-bold"
            >
              Start new cart
            </button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          Your cart has items from <b>{conflict?.other}</b>. Starting a new cart will remove them so you can order from <b>{restaurant.name}</b>.
        </p>
      </Modal>

      <p className="text-center mt-10 text-xs text-text-secondary">
        <Link href="/" className="underline">
          Browse more restaurants
        </Link>
      </p>
    </div>
  );
}

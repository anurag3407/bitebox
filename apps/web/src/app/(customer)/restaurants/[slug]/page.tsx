"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Minus, Plus, Search, Share2, Star } from "lucide-react";
import { MenuItemDto, RestaurantDetailDto } from "@startup/contracts";
import { AddItemInput, useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { ItemCustomizerModal } from "@/components/menu/ItemCustomizerModal";
import { Modal } from "@/components/ui/modal";
import { EmptyState, SafeImage, VegMark } from "@/components/ui/misc";
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
    return <span className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-medium text-ink-muted shadow-soft">{item.isAvailable ? "Unavailable" : "Sold out"}</span>;
  }

  if (quantity > 0 && (simpleLine || isCustomisable)) {
    return (
      <div className="stepper shadow-soft">
        <button
          aria-label={`Remove one ${item.name}`}
          onClick={() => {
            // Customised dishes are edited from the cart, where each variant is its own line
            if (simpleLine) cart.updateQuantity(simpleLine.lineId, simpleLine.quantity - 1);
            else toast("Edit customised items from your cart");
          }}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-6 text-center tabular">{quantity}</span>
        <button aria-label={`Add one ${item.name}`} onClick={add}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button onClick={add} className="btn btn-sm border border-line bg-white px-6 text-ink shadow-soft hover:border-ink">
      Add
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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

  // Highlight the category currently in view
  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCategory(visible.target.id.replace(/^cat-/, ""));
      },
      { rootMargin: "-160px 0px -60% 0px" }
    );
    for (const cat of categories) {
      const el = document.getElementById(`cat-${cat.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories]);

  if (restaurantQuery.isPending) {
    return (
      <div className="page space-y-8 py-10">
        <div className="skeleton aspect-[16/9] sm:aspect-[21/8]" />
        <div className="h-8 w-1/3 animate-pulse rounded-full bg-subtle" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    );
  }

  if (!restaurant) {
    const notFound = restaurantQuery.error instanceof ApiError && restaurantQuery.error.status === 404;
    return (
      <EmptyState
        title={notFound ? "We couldn't find that restaurant" : "Couldn't load the menu"}
        body={notFound ? "It may have moved or closed." : "Check your connection and try again."}
        action={
          <button onClick={() => (notFound ? router.push("/") : restaurantQuery.refetch())} className="btn btn-primary">
            {notFound ? "Browse restaurants" : "Try again"}
          </button>
        }
      />
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
  const jumpTo = (id: string) => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const eta = serviceability.data?.estimatedDeliveryMinutes
    ? `${serviceability.data.estimatedDeliveryMinutes} min`
    : `${restaurant.deliveryTimeMinMinutes}–${restaurant.deliveryTimeMaxMinutes} min`;

  return (
    <div className="page pb-16 pt-6 sm:pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> All restaurants
        </Link>
        <button onClick={share} aria-label="Share restaurant" className="btn btn-ghost btn-icon -mr-2">
          <Share2 className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="aspect-[16/9] overflow-hidden rounded-3xl bg-subtle sm:aspect-[21/8]">
        <SafeImage src={restaurant.heroImageUrl} alt={restaurant.name} className="h-full w-full object-cover" />
      </div>

      <header className="mt-8 flex flex-col gap-6 sm:mt-10 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="h-page">{restaurant.name}</h1>
          <p className="mt-2 text-base text-ink-muted">
            {restaurant.pureVeg && <span className="text-success">Pure veg · </span>}
            {restaurant.cuisines.join(", ")}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin className="h-4 w-4 shrink-0" /> <span className="truncate">{restaurant.addressText}</span>
          </p>
        </div>
        <dl className="flex shrink-0 gap-8 sm:gap-10">
          <div>
            <dt className="text-xs text-ink-muted">Rating</dt>
            <dd className="mt-1 flex items-center gap-1 text-lg font-semibold text-ink tabular">
              <Star className="h-4 w-4 fill-ink" /> {restaurant.rating.toFixed(1)}
              <span className="text-xs font-normal text-ink-muted">({restaurant.ratingCount.toLocaleString("en-IN")})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Delivery</dt>
            <dd className="mt-1 text-lg font-semibold text-ink tabular">{eta}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">For one</dt>
            <dd className="mt-1 text-lg font-semibold text-ink tabular">{formatRupees(restaurant.avgPriceForOnePaise)}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-6 space-y-3">
        {restaurant.offerTag && <p className="notice bg-accent-soft font-medium text-accent">{restaurant.offerTag}</p>}
        {!restaurant.isAcceptingOrders && (
          <p className="notice notice-warn">{restaurant.isOpen ? "This restaurant isn't taking orders right now." : `Closed. ${restaurant.nextOpenText ?? ""}`}</p>
        )}
        {location && serviceability.data && !deliversHere && (
          <p className="notice notice-danger">{serviceability.data.reason ?? "This restaurant doesn't deliver to your selected location."}</p>
        )}
      </div>

      {/* Toolbar */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-5 mt-10 border-b border-line bg-white/95 px-5 pt-4 backdrop-blur-xl sm:top-[calc(72px+env(safe-area-inset-top))] sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder="Search the menu"
              aria-label="Search the menu"
              className="h-10 w-full rounded-full bg-subtle pl-10 pr-4 text-sm text-ink outline-none placeholder:text-ink-muted focus:bg-white focus:ring-1 focus:ring-line-strong"
            />
          </div>
          <button onClick={() => setVegOnly(!vegOnly)} aria-pressed={vegOnly} className="chip">
            Veg
          </button>
          <button onClick={() => setBestsellersOnly(!bestsellersOnly)} aria-pressed={bestsellersOnly} className="chip">
            Bestsellers
          </button>
        </div>
        <nav className="no-scrollbar mt-3 flex gap-6 overflow-x-auto lg:hidden" aria-label="Menu categories">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => jumpTo(cat.id)}
              className={`-mb-px shrink-0 border-b-2 pb-3 text-sm transition-colors ${activeCategory === cat.id ? "border-ink font-medium text-ink" : "border-transparent text-ink-muted"}`}
            >
              {cat.name}
            </button>
          ))}
        </nav>
        <div className="hidden h-4 lg:block" />
      </div>

      <div className="mt-8 lg:grid lg:grid-cols-[200px_1fr] lg:gap-16">
        <aside className="hidden lg:block">
          <nav className="sticky top-[calc(72px+env(safe-area-inset-top)+6rem)] space-y-1" aria-label="Menu categories">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => jumpTo(cat.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  activeCategory === cat.id ? "bg-subtle font-medium text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <span className="truncate">{cat.name}</span>
                <span className="text-xs text-ink-muted tabular">{cat.items.length}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-14">
          {categories.length === 0 && <EmptyState title="No dishes match" body="Try a different search or turn off a filter." />}
          {categories.map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-48">
              <h2 className="h-section">{cat.name}</h2>
              <ul className="rows mt-2">
                {cat.items.map((item) => {
                  const customisable = item.variants.length > 0 || item.modifierGroups.length > 0;
                  return (
                    <li key={item.id} className={`flex gap-5 py-7 sm:gap-8 ${!item.isAvailable ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <VegMark tag={item.dietaryTag} />
                          {item.isBestseller && <span className="text-xs font-medium text-accent">Bestseller</span>}
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-ink">{item.name}</h3>
                        <p className="mt-1 text-[15px] text-ink tabular">
                          {item.variants.length > 0 ? `from ${formatRupees(Math.min(...item.variants.map((v) => v.pricePaise)))}` : formatRupees(item.pricePaise)}
                        </p>
                        {item.description && <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-ink-muted">{item.description}</p>}
                      </div>
                      <div className="flex w-28 shrink-0 flex-col items-center sm:w-36">
                        <SafeImage src={item.imageUrl} alt={item.name} className="aspect-square w-full rounded-2xl object-cover" />
                        <div className="-mt-5">
                          <QuantityControl
                            item={item}
                            restaurant={restaurant}
                            onCustomize={() => setCustomizingItem(item)}
                            onConflict={(pending, other) => setConflict({ pending, other })}
                          />
                        </div>
                        {customisable && item.isAvailable && <span className="mt-2 text-[11px] text-ink-muted">Customisable</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {(reviews.data?.length ?? 0) > 0 && (
            <section className="border-t border-line pt-14">
              <h2 className="h-section">What people are saying</h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {reviews.data!.map((r) => (
                  <li key={r.id} className="panel p-6">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-ink">{r.customerName}</span>
                      <span className="flex items-center gap-1 text-ink tabular">
                        <Star className="h-3.5 w-3.5 fill-ink" /> {r.foodRating}
                      </span>
                    </div>
                    {r.comment && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{r.comment}</p>}
                    <p className="mt-3 text-xs text-ink-muted">{timeAgo(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {customizingItem && (
        <ItemCustomizerModal
          key={customizingItem.id}
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
        description={`Your cart has items from ${conflict?.other}. Starting a new cart removes them so you can order from ${restaurant.name}.`}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setConflict(null)} className="btn btn-secondary flex-1">
              Keep cart
            </button>
            <button
              onClick={() => {
                if (conflict) cart.replaceWith([conflict.pending]);
                setConflict(null);
              }}
              className="btn btn-primary flex-1"
            >
              Start new cart
            </button>
          </div>
        }
      />
    </div>
  );
}

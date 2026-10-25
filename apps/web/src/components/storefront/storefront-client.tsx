"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { RestaurantDetailDto } from "@startup/contracts";
import { AddItemInput, useCartStore } from "@/features/cart/cart-store";
import { Logo } from "@/components/brand/logo";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SafeImage, VegMark } from "@/components/ui/misc";
import { formatRupees } from "@/lib/format";

export function StorefrontClient({ restaurant, token }: { restaurant: RestaurantDetailDto; token?: string }) {
  const toast = useToast();
  const addItem = useCartStore((s) => s.addItem);
  const replaceWith = useCartStore((s) => s.replaceWith);
  const count = useCartStore((s) => s.getItemCount());
  const subtotal = useCartStore((s) => s.getSubtotalPaise());
  const [directActive, setDirectActive] = useState(Boolean(token));
  const [conflict, setConflict] = useState<{ pending: AddItemInput; other: string } | null>(null);

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
    const input: AddItemInput = {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      menuItemId: item.id,
      name: item.name,
      basePricePaise: item.pricePaise,
      quantity: 1,
      imageUrl: item.imageUrl ?? undefined,
      isVeg: item.dietaryTag === "VEG" || item.dietaryTag === "VEGAN",
    };
    const result = addItem(input);
    if (result.conflictRestaurantName) {
      setConflict({ pending: input, other: result.conflictRestaurantName });
      return;
    }
    if (!result.success) {
      toast(result.reason ?? "Could not add this item.", "error");
      return;
    }
    toast(`${item.name} added`, "success");
  };

  return (
    <main className="min-h-screen bg-white pb-32">
      <header className="border-b border-line">
        <div className="page-narrow flex h-16 items-center justify-between gap-3">
          <Link href="/" aria-label="BiteBox home">
            <Logo />
          </Link>
          <span className={`badge ${directActive ? "badge-success" : "badge-neutral"}`}>{directActive ? "Direct order active" : "Direct link"}</span>
        </div>
      </header>

      <section className="page-narrow pt-10 sm:pt-14">
        <div className="flex items-start gap-5">
          <SafeImage src={restaurant.heroImageUrl ?? undefined} alt={restaurant.name} className="h-20 w-20 shrink-0 rounded-3xl object-cover sm:h-24 sm:w-24" />
          <div className="min-w-0">
            <h1 className="h-page">{restaurant.name}</h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">{restaurant.cuisines.join(", ")}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1 text-ink">
                <Star className="h-3.5 w-3.5 fill-ink" /> {restaurant.rating.toFixed(1)}
              </span>
              <span>·</span>
              <span>
                {restaurant.deliveryTimeMinMinutes}–{restaurant.deliveryTimeMaxMinutes} min
              </span>
            </p>
          </div>
        </div>
        <div className="panel mt-8 p-5">
          <p className="text-sm font-medium text-ink">You&apos;re ordering direct from {restaurant.name}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">0% restaurant commission. Menu prices go to the kitchen; delivery and platform fees are shown at checkout.</p>
        </div>
      </section>

      <div className="page-narrow mt-12 space-y-14">
        {restaurant.categories.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">The menu is being updated.</p>}
        {restaurant.categories.map((category) => (
          <section key={category.id}>
            <h2 className="h-section">{category.name}</h2>
            <ul className="rows mt-2">
              {category.items.map((item) => {
                const customisable = item.variants.length > 0 || item.modifierGroups.length > 0;
                return (
                  <li key={item.id} className={`flex gap-5 py-6 ${item.isAvailable ? "" : "opacity-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <VegMark tag={item.dietaryTag} />
                        {item.isBestseller && <span className="text-xs font-medium text-accent">Bestseller</span>}
                      </div>
                      <h3 className="mt-2 font-semibold text-ink">{item.name}</h3>
                      <p className="mt-1 text-[15px] text-ink tabular">{formatRupees(item.pricePaise)}</p>
                      {item.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{item.description}</p>}
                    </div>
                    <div className="flex w-24 shrink-0 flex-col items-center">
                      <SafeImage src={item.imageUrl ?? undefined} alt={item.name} className="aspect-square w-full rounded-2xl object-cover" />
                      <div className="-mt-4">
                        {item.isAvailable ? (
                          customisable ? (
                            <Link href={`/restaurants/${restaurant.slug}`} className="btn btn-sm border border-line bg-white px-4 text-ink shadow-soft hover:border-ink">
                              Options
                            </Link>
                          ) : (
                            <button onClick={() => add(item)} className="btn btn-sm border border-line bg-white px-5 text-ink shadow-soft hover:border-ink">
                              Add
                            </button>
                          )
                        ) : (
                          <span className="inline-flex h-9 items-center rounded-full bg-white px-3 text-xs text-ink-muted shadow-soft">Sold out</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {count > 0 && (
        <div className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl animate-sheet-up">
          <Link href="/checkout" className="flex items-center justify-between gap-4 rounded-full bg-ink py-2.5 pl-6 pr-2.5 text-white shadow-pop">
            <span className="text-sm font-semibold tabular">
              {count} item{count === 1 ? "" : "s"} · {formatRupees(subtotal)}
            </span>
            <span className="flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-medium text-ink">
              Checkout <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      )}

      <Modal
        open={!!conflict}
        onClose={() => setConflict(null)}
        size="sm"
        title="Start a new cart?"
        description={`Your cart has items from ${conflict?.other}. Starting a new cart removes them.`}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setConflict(null)} className="btn btn-secondary flex-1">
              Keep cart
            </button>
            <button
              onClick={() => {
                if (conflict) replaceWith([conflict.pending]);
                setConflict(null);
              }}
              className="btn btn-primary flex-1"
            >
              Start new cart
            </button>
          </div>
        }
      />
    </main>
  );
}

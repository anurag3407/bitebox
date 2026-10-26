"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";
import { useCartHydrated } from "@/features/hydration";
import { EmptyState, PageSpinner, SafeImage, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatRupees } from "@/lib/format";

export default function CartPage() {
  const cart = useCartStore();
  const ready = useCartHydrated();
  const toast = useToast();

  if (!ready) return <PageSpinner />;

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Your cart is empty"
        body="Add dishes from a restaurant near you to get started."
        action={
          <Link href="/" className="btn btn-primary">
            Browse restaurants
          </Link>
        }
      />
    );
  }

  const itemCount = cart.getItemCount();
  const subtotal = cart.getSubtotalPaise();

  return (
    <div className="page max-w-3xl pb-40 pt-8 sm:pt-12">
      <Link
        href={cart.restaurantSlug ? `/restaurants/${cart.restaurantSlug}` : "/"}
        className="btn btn-ghost btn-sm -ml-4 gap-1.5"
      >
        <ArrowLeft className="h-4 w-4" /> {cart.restaurantName}
      </Link>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="h-page">Your cart</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {cart.restaurantName}
          </p>
        </div>
        <button
          onClick={() => {
            cart.clearCart();
            toast("Cart cleared", "success");
          }}
          className="btn btn-ghost btn-sm text-ink-muted"
        >
          <Trash2 className="h-4 w-4" /> Clear
        </button>
      </div>

      <ul className="rows mt-8">
        {cart.items.map((line) => (
          <li key={line.lineId} className="flex items-start gap-4 py-5">
            <SafeImage src={line.imageUrl} alt={line.name} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {line.isVeg !== undefined && <VegMark tag={line.isVeg ? "VEG" : "NON_VEG"} />}
                <h2 className="line-clamp-2 text-[15px] font-medium text-ink">{line.name}</h2>
              </div>
              {(line.variantName || line.selectedOptionNames.length > 0) && (
                <p className="mt-1 text-sm text-ink-muted">{[line.variantName, ...line.selectedOptionNames].filter(Boolean).join(" · ")}</p>
              )}
              {line.instructions && <p className="mt-1 text-sm italic text-ink-muted">“{line.instructions}”</p>}
              <button onClick={() => cart.removeItem(line.lineId)} className="mt-2 text-xs font-medium text-ink-muted hover:text-danger">
                Remove
              </button>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              <span className="text-[15px] text-ink tabular">{formatRupees(line.unitPricePaise * line.quantity)}</span>
              <div className="stepper">
                <button aria-label={`Remove one ${line.name}`} onClick={() => cart.updateQuantity(line.lineId, line.quantity - 1)}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-5 text-center tabular">{line.quantity}</span>
                <button aria-label={`Add one ${line.name}`} onClick={() => cart.updateQuantity(line.lineId, line.quantity + 1)}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <label className="block">
          <span className="label">Cooking or delivery instructions</span>
          <textarea
            value={cart.instructions}
            onChange={(e) => cart.setInstructions(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Less spicy, no onions…"
            className="input"
          />
        </label>
      </div>

      <Link
        href={cart.restaurantSlug ? `/restaurants/${cart.restaurantSlug}` : "/"}
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
      >
        Add more items
      </Link>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl sm:static sm:mt-10 sm:rounded-3xl sm:border sm:p-6">
        <div className="mb-3 flex items-center justify-between text-sm sm:mb-4">
          <span className="text-ink-muted">Subtotal</span>
          <span className="font-medium text-ink tabular">{formatRupees(subtotal)}</span>
        </div>
        <Link href="/checkout" className="btn btn-primary btn-lg btn-block justify-between">
          Proceed to checkout <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-2 text-center text-xs text-ink-muted">Taxes and delivery fee shown at checkout</p>
      </div>
    </div>
  );
}

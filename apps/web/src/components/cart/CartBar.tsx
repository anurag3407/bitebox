"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";
import { formatRupees } from "@/lib/format";

/** Floating "view cart" bar; sits above the mobile tab bar. */
export function CartBar() {
  const pathname = usePathname();
  const itemCount = useCartStore((s) => s.getItemCount());
  const subtotalPaise = useCartStore((s) => s.getSubtotalPaise());
  const restaurantName = useCartStore((s) => s.restaurantName);

  // Hidden where it would duplicate the page's own call to action
  if (itemCount === 0 || pathname.startsWith("/checkout") || pathname.startsWith("/cart") || pathname.startsWith("/orders")) return null;

  return (
    <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 animate-sheet-up sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-[380px]">
      <Link href="/cart" className="flex items-center justify-between gap-4 rounded-full bg-ink py-2.5 pl-6 pr-2.5 text-white shadow-pop transition-transform hover:scale-[1.01]">
        <span className="min-w-0">
          <span className="block text-sm font-semibold tabular">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatRupees(subtotalPaise)}
          </span>
          <span className="block truncate text-xs text-white/60">{restaurantName}</span>
        </span>
        <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-medium text-ink">
          View cart <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}

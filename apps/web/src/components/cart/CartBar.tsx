"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";
import { formatRupees } from "@/lib/format";

export function CartBar() {
  const pathname = usePathname();
  const itemCount = useCartStore((s) => s.getItemCount());
  const subtotalPaise = useCartStore((s) => s.getSubtotalPaise());
  const restaurantName = useCartStore((s) => s.restaurantName);

  // Hidden where it would duplicate the page's own call to action
  if (itemCount === 0 || pathname.startsWith("/checkout") || pathname.startsWith("/orders")) return null;

  return (
    <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:bottom-4 left-4 right-4 sm:left-auto sm:right-8 sm:w-96 z-40">
      <Link href="/checkout" className="flex items-center justify-between bg-brand hover:bg-brand-hover text-white px-5 py-3.5 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black">
              {itemCount} {itemCount === 1 ? "item" : "items"} · {formatRupees(subtotalPaise)}
            </p>
            <p className="text-[11px] text-white/90 truncate">From {restaurantName}</p>
          </div>
        </div>
        <span className="flex items-center gap-1 font-bold text-xs bg-white text-brand px-3 py-1.5 rounded-xl">
          View cart <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </Link>
    </div>
  );
}

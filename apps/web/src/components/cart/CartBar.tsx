"use client";

import React from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";

export function CartBar() {
  const items = useCartStore((s) => s.items);
  const itemCount = useCartStore((s) => s.getItemCount());
  const subtotalPaise = useCartStore((s) => s.getSubtotalPaise());
  const restaurantName = useCartStore((s) => s.restaurantName);

  if (itemCount === 0) return null;

  const subtotalRupees = (subtotalPaise / 100).toFixed(0);

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-8 sm:w-96 z-40 animate-in slide-in-from-bottom duration-300">
      <Link
        href="/checkout"
        className="flex items-center justify-between bg-brand hover:bg-brand-hover text-white px-5 py-3.5 rounded-2xl shadow-2xl transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-extrabold text-white/80">
                {itemCount} {itemCount === 1 ? "Item" : "Items"}
              </span>
              <span className="text-xs text-white/50">•</span>
              <span className="text-sm font-black text-white">₹{subtotalRupees}</span>
            </div>
            <p className="text-[11px] text-white/90 truncate max-w-[180px]">
              From {restaurantName || "Restaurant"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-bold text-xs bg-white text-brand px-3 py-1.5 rounded-xl group-hover:translate-x-0.5 transition-transform shadow-xs">
          <span>View Cart</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </Link>
    </div>
  );
}

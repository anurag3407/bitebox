# 33 - Next.js Frontend Scaffolding & Cart Implementation

## 1. Why Next.js 14 App Router for Food Delivery Web Apps?

A modern food delivery website must fulfill two opposing requirements:
1. **Search Engine Discovery (SEO):** When someone in Delhi googles *"best biryani near connaught place"*, your restaurant pages (`/delhi/biryani-blues-connaught-place`) must load pre-rendered HTML in **under 800ms** so Google indexes every menu item and category.
2. **App-Like Interactivity:** When adding a pizza to the basket, the UI must feel like a native mobile app: zero page flashes, persistent bottom carts, instant count increments, and smooth slide-up drawers.

**Next.js 14 App Router** accomplishes this by combining **React Server Components (RSC)** for pre-rendered pages with **Zustand Client Components** for local cart interactions.

```mermaid
flowchart TD
    subgraph Server Rendering (RSC)
        URL[/restaurant/biryani-blues] --> FetchMenu[Server fetches menu from Redis/Postgres]
        FetchMenu --> PreRenderHTML[Pre-Render Static HTML + Schema.org Food SEO]
    end

    subgraph Client Hydration
        PreRenderHTML --> Hydrate[Hydrate Interactive Islands]
        Hydrate --> DishCards[Dish Cards: Add to Cart buttons]
        DishCards --> ZustandCart[Zustand Cart Store: In-Memory + LocalStorage]
        ZustandCart --> BottomDrawer[Floating Bottom Cart Drawer Sheet]
    end
```

---

## 2. Root Layout & Global Provider (`app/layout.tsx`)

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FastBite | Hyperlocal Food & Grocery Delivery",
  description: "Get food and groceries delivered from your favorite local kitchens in under 25 minutes.",
  manifest: "/manifest.json",
  themeColor: "#FC8019",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <Navbar />
        {children}
      </body>
    </html>
  );
}
```

---

## 3. High-Conversion Dish Card (`components/DishCard.tsx`)

```tsx
"use client";

import Image from "next/image";
import { useCartStore } from "@/stores/useCartStore";

interface DishProps {
  restaurantId: string;
  item: {
    id: string;
    name: string;
    price: number;
    description: string | null;
    is_veg: boolean;
    image_url: string | null;
  };
}

export function DishCard({ restaurantId, item }: DishProps) {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const cartEntry = items.find((i) => i.id === item.id);
  const quantity = cartEntry?.quantity || 0;

  return (
    <div className="flex justify-between items-start gap-4 p-4 border-b border-slate-100 hover:bg-slate-50/50 transition">
      <div className="flex-1 space-y-1">
        {/* Veg / Non-Veg Indicator Icon */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-3.5 h-3.5 border flex items-center justify-center p-0.5 rounded-sm ${
              item.is_veg ? "border-emerald-600" : "border-rose-600"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                item.is_veg ? "bg-emerald-600" : "bg-rose-600"
              }`}
            />
          </span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {item.is_veg ? "Pure Veg" : "Non-Veg"}
          </span>
        </div>

        <h3 className="font-semibold text-slate-800 text-base">{item.name}</h3>
        <p className="font-bold text-slate-900 text-sm">₹{item.price}</p>
        {item.description && (
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Dish Image & Add/Quantity Button */}
      <div className="relative flex flex-col items-center">
        {item.image_url ? (
          <div className="relative w-28 h-24 rounded-xl overflow-hidden shadow-sm">
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover"
              sizes="112px"
            />
          </div>
        ) : (
          <div className="w-28 h-20 rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
            No Image
          </div>
        )}

        {/* Floating Add / Quantity Pill */}
        <div className="absolute -bottom-2 bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden flex items-center">
          {quantity === 0 ? (
            <button
              onClick={() => addItem(restaurantId, item)}
              className="px-5 py-1.5 text-xs font-extrabold text-emerald-600 hover:bg-emerald-50 transition tracking-wide"
            >
              ADD
            </button>
          ) : (
            <div className="flex items-center gap-3 px-2 py-1 text-xs font-bold text-emerald-600">
              <button
                onClick={() => removeItem(item.id)}
                className="hover:bg-slate-100 px-1.5 py-0.5 rounded transition"
              >
                -
              </button>
              <span className="text-slate-800 text-sm">{quantity}</span>
              <button
                onClick={() => addItem(restaurantId, item)}
                className="hover:bg-slate-100 px-1.5 py-0.5 rounded transition"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 4. Floating Checkout Drawer (`components/CartFloatingDrawer.tsx`)

Displays an unobtrusive floating bar at the bottom of the screen when items are added, opening into a checkout breakdown sheet:

```tsx
"use client";

import { useState } from "react";
import { useCartStore } from "@/stores/useCartStore";
import { ShoppingBag, ArrowRight } from "lucide-react";

export function CartFloatingDrawer() {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const [isOpen, setIsOpen] = useState(false);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) return null;

  return (
    <>
      {/* Sticky Mobile Bottom Bar */}
      <div className="fixed bottom-4 left-0 right-0 max-w-lg mx-auto px-4 z-40">
        <div className="bg-emerald-600 text-white rounded-2xl shadow-xl p-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-700/80 p-2 rounded-xl">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-100">{totalQuantity} items added</p>
              <p className="font-extrabold text-base">₹{subtotal}</p>
            </div>
          </div>

          <button
            onClick={() => (window.location.href = "/checkout")}
            className="flex items-center gap-1.5 font-bold text-sm bg-white text-emerald-700 px-4 py-2 rounded-xl hover:bg-emerald-50 transition shadow-sm"
          >
            View Cart
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}
```

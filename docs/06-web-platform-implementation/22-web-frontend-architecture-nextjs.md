# 22 - Web Frontend Architecture: Next.js & Modern Client Stack

## 1. Web-First Architecture Overview

The web platform is built using **Next.js 14+ (App Router)** with **React Server Components (RSC)**. This architecture provides the fast initial page loads of server rendering combined with the fluid, single-page application (SPA) feel required for interactive cart management and live map tracking.

```mermaid
flowchart TD
    Browser[Browser / PWA Client] --> Edge[Vercel / Cloudflare Edge Network]
    
    subgraph Next.js App Router
        Edge --> RSC[React Server Components: SEO & Fast Shell
        /restaurants/[slug] - Menu Tree, Ratings, Metadata]
        
        RSC --> ClientBoundary[Client Components: Interactivity
        CartDrawer, DishCustomizerModal, SearchAutocomplete, LiveMap]
    end

    subgraph State Management Tier
        ClientBoundary --> TanStack[TanStack Query v5: Server State & Polling]
        ClientBoundary --> Zustand[Zustand: Local Cart & Address Store]
    end

    subgraph Real-Time Updates
        ClientBoundary --> SSEConn[Server-Sent Events: /api/orders/:id/stream]
    end
```

---

## 2. Server Components (RSC) vs. Client Components

To optimize Core Web Vitals (Largest Contentful Paint < 1.2s), the UI is strictly partitioned:

| Component Type | Usage Examples | Rendering Strategy |
| :--- | :--- | :--- |
| **Server Components (RSC)** | Restaurant profile headers, SEO menus, category lists, footers. | Pre-rendered on server. Zero JavaScript sent to client. |
| **Client Components (`"use client"`)** | Cart button, item quantity toggler (`+ / -`), map view, search bar. | Hydrated on client for instant sub-10ms user interactions. |

```tsx
// app/restaurant/[slug]/page.tsx (Server Component)
import { Suspense } from "react";
import { getRestaurantMenu } from "@/lib/api";
import { MenuCategoryList } from "@/components/MenuCategoryList";
import { CartFloatingBar } from "@/components/CartFloatingBar"; // Client Component

export default async function RestaurantPage({ params }: { params: { slug: string } }) {
  // Direct server-side cached fetch (Sub-10ms via Redis)
  const menuData = await getRestaurantMenu(params.slug);

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <RestaurantHeader restaurant={menuData.restaurant} />
      <Suspense fallback={<MenuSkeleton />}>
        <MenuCategoryList categories={menuData.categories} />
      </Suspense>
      {/* Interactive client component for cart state */}
      <CartFloatingBar />
    </main>
  );
}
```

---

## 3. Client State Management: Zustand & TanStack Query

State is cleanly bifurcated to prevent state desynchronization bugs:

1. **Server State (TanStack Query):**
   * Manages server-derived data: active restaurant feeds, live order tracking status, and user order history.
   * Employs optimistic UI updates when applying coupon codes or toggling item favorites.
2. **Local Client State (Zustand):**
   * Manages ephemeral cart items, selected delivery address, and UI modal states.
   * Persisted locally in `localStorage` so a user refreshing the browser retains their active cart items.

```typescript
// stores/useCartStore.ts (Zustand Store)
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartStore {
  restaurantId: string | null;
  items: CartItem[];
  addItem: (restaurantId: string, item: Omit<CartItem, "quantity">) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  subtotal: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      items: [],
      addItem: (restaurantId, item) => {
        const state = get();
        // Prevent multi-restaurant cart mixing
        if (state.restaurantId && state.restaurantId !== restaurantId) {
          if (!confirm("Start a new basket? Your existing items will be removed.")) return;
          set({ restaurantId, items: [{ ...item, quantity: 1 }] });
          return;
        }

        const existing = state.items.find((i) => i.id === item.id);
        if (existing) {
          set({
            items: state.items.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
            ),
          });
        } else {
          set({ restaurantId, items: [...state.items, { ...item, quantity: 1 }] });
        }
      },
      removeItem: (itemId) => {
        const state = get();
        const existing = state.items.find((i) => i.id === itemId);
        if (!existing) return;
        if (existing.quantity === 1) {
          const nextItems = state.items.filter((i) => i.id !== itemId);
          set({ items: nextItems, restaurantId: nextItems.length === 0 ? null : state.restaurantId });
        } else {
          set({
            items: state.items.map((i) =>
              i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
            ),
          });
        }
      },
      clearCart: () => set({ restaurantId: null, items: [] }),
      subtotal: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    }),
    { name: "food-platform-cart" }
  )
);
```

---

## 4. Progressive Web App (PWA) Capabilities

The web application installs as a **Progressive Web App (PWA)**, functioning like a native app on iOS Safari and Android Chrome:
* **Web App Manifest (`manifest.json`):** Configured with `display: "standalone"`, custom branded splash icons, and theme colors.
* **Service Worker Caching:** Caches static fonts, icons, and shell layouts via Workbox.
* **Web Push Notifications:** Receives background order status notifications (*"Rider is approaching your address!"*) even if the browser tab is closed.
* **Dynamic Code Splitting:** Heavy interactive mapping libraries (Mapbox GL / Leaflet) are loaded dynamically using `next/dynamic` only when the user visits the active tracking page, keeping the home page bundle size under 90 KB.

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItemInput, ModifierOptionDto } from "@startup/contracts";

// Mirrors server validation (CartItemInputSchema / CreateQuoteRequestSchema)
export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 50;

export interface CartLineItem extends CartItemInput {
  lineId: string;
  name: string;
  variantName?: string;
  selectedOptionNames: string[];
  basePricePaise: number;
  optionsPricePaise: number;
  unitPricePaise: number;
  imageUrl?: string;
  isVeg?: boolean;
}

export interface AddItemInput {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  menuItemId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  selectedOptions?: ModifierOptionDto[];
  basePricePaise: number;
  quantity: number;
  instructions?: string;
  imageUrl?: string;
  isVeg?: boolean;
}

export interface CartStoreState {
  restaurantId: string | null;
  restaurantName: string | null;
  restaurantSlug: string | null;
  items: CartLineItem[];
  instructions: string;
  tipPaise: number;
  couponCode: string | null;

  // Returns the conflicting restaurant when the cart holds another restaurant's items
  addItem: (item: AddItemInput) => { success: boolean; conflictRestaurantName?: string; reason?: string };
  // Empties the cart and starts it with `items` (used for "start a new cart" and reorder)
  replaceWith: (items: AddItemInput[]) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  setInstructions: (text: string) => void;
  setTip: (paise: number) => void;
  setCoupon: (code: string | null) => void;

  getItemCount: () => number;
  getSubtotalPaise: () => number;
  getQuantityOf: (menuItemId: string) => number;
}

export function generateLineId(
  menuItemId: string,
  variantId?: string,
  selectedOptionIds: string[] = [],
  instructions?: string
): string {
  const sortedOptions = [...selectedOptionIds].sort().join(",");
  return `${menuItemId}_${variantId || "default"}_${sortedOptions}_${(instructions ?? "").trim().toLowerCase()}`;
}

function toLine(item: AddItemInput): CartLineItem {
  const selectedOptionIds = (item.selectedOptions || []).map((o) => o.id);
  const optionsPricePaise = (item.selectedOptions || []).reduce((sum, o) => sum + o.pricePaise, 0);
  return {
    lineId: generateLineId(item.menuItemId, item.variantId, selectedOptionIds, item.instructions),
    menuItemId: item.menuItemId,
    variantId: item.variantId,
    variantName: item.variantName,
    selectedOptionIds,
    selectedOptionNames: (item.selectedOptions || []).map((o) => o.name),
    quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, item.quantity)),
    name: item.name,
    basePricePaise: item.basePricePaise,
    optionsPricePaise,
    unitPricePaise: item.basePricePaise + optionsPricePaise,
    instructions: item.instructions,
    imageUrl: item.imageUrl,
    isVeg: item.isVeg,
  };
}

const EMPTY = {
  restaurantId: null,
  restaurantName: null,
  restaurantSlug: null,
  items: [] as CartLineItem[],
  instructions: "",
  couponCode: null,
};

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      tipPaise: 0,

      addItem: (item) => {
        const state = get();

        // Single restaurant cart rule
        if (state.restaurantId && state.restaurantId !== item.restaurantId && state.items.length > 0) {
          return { success: false, conflictRestaurantName: state.restaurantName || "another restaurant" };
        }

        const line = toLine(item);
        const existingIndex = state.items.findIndex((i) => i.lineId === line.lineId);
        let newItems: CartLineItem[];
        if (existingIndex >= 0) {
          newItems = [...state.items];
          const existing = newItems[existingIndex]!;
          if (existing.quantity >= MAX_LINE_QUANTITY) {
            return { success: false, reason: `You can add up to ${MAX_LINE_QUANTITY} of an item.` };
          }
          newItems[existingIndex] = { ...existing, quantity: Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity) };
        } else {
          if (state.items.length >= MAX_CART_LINES) return { success: false, reason: "Your cart is full." };
          newItems = [...state.items, line];
        }

        set({
          restaurantId: item.restaurantId,
          restaurantName: item.restaurantName,
          restaurantSlug: item.restaurantSlug,
          items: newItems,
        });
        return { success: true };
      },

      replaceWith: (items) => {
        set({ ...EMPTY });
        for (const item of items) get().addItem(item);
      },

      updateQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineId);
          return;
        }
        set({
          items: get().items.map((i) => (i.lineId === lineId ? { ...i, quantity: Math.min(MAX_LINE_QUANTITY, quantity) } : i)),
        });
      },

      removeItem: (lineId) => {
        const newItems = get().items.filter((i) => i.lineId !== lineId);
        if (newItems.length === 0) set({ ...EMPTY });
        else set({ items: newItems });
      },

      clearCart: () => set({ ...EMPTY }),
      setInstructions: (instructions) => set({ instructions: instructions.slice(0, 300) }),
      setTip: (tipPaise) => set({ tipPaise: Math.max(0, Math.min(50_000, Math.round(tipPaise))) }),
      setCoupon: (couponCode) => set({ couponCode: couponCode?.trim().toUpperCase() || null }),

      getItemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
      getSubtotalPaise: () => get().items.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0),
      getQuantityOf: (menuItemId) =>
        get().items.filter((i) => i.menuItemId === menuItemId).reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "food_delivery_cart_v2",
      version: 2,
      migrate: (persisted: unknown) => {
        const old = persisted as Partial<CartStoreState> | undefined;
        // Keep v1 carts but normalise fields added in v2
        return { ...EMPTY, tipPaise: 0, ...old, items: (old?.items ?? []).slice(0, MAX_CART_LINES) } as CartStoreState;
      },
    }
  )
);

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItemInput, ModifierOptionDto } from "@startup/contracts";

export interface CartLineItem extends CartItemInput {
  lineId: string;
  name: string;
  variantName?: string;
  selectedOptionNames: string[];
  basePricePaise: number;
  optionsPricePaise: number;
  unitPricePaise: number;
  imageUrl?: string;
}

export interface CartStoreState {
  restaurantId: string | null;
  restaurantName: string | null;
  restaurantSlug: string | null;
  items: CartLineItem[];
  instructions: string;

  // Actions
  addItem: (item: {
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
  }) => { success: boolean; conflictRestaurantName?: string };

  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  setInstructions: (text: string) => void;

  // Selectors
  getItemCount: () => number;
  getSubtotalPaise: () => number;
}

export function generateLineId(
  menuItemId: string,
  variantId?: string,
  selectedOptionIds: string[] = []
): string {
  const sortedOptions = [...selectedOptionIds].sort().join(",");
  return `${menuItemId}_${variantId || "default"}_${sortedOptions}`;
}

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      restaurantName: null,
      restaurantSlug: null,
      items: [],
      instructions: "",

      addItem: (item) => {
        const state = get();

        // Single restaurant cart rule
        if (state.restaurantId && state.restaurantId !== item.restaurantId && state.items.length > 0) {
          return {
            success: false,
            conflictRestaurantName: state.restaurantName || "another restaurant",
          };
        }

        const selectedOptionIds = (item.selectedOptions || []).map((o) => o.id);
        const selectedOptionNames = (item.selectedOptions || []).map((o) => o.name);
        const optionsPricePaise = (item.selectedOptions || []).reduce(
          (sum, o) => sum + o.pricePaise,
          0
        );
        const unitPricePaise = item.basePricePaise + optionsPricePaise;
        const lineId = generateLineId(item.menuItemId, item.variantId, selectedOptionIds);

        const existingIndex = state.items.findIndex((i) => i.lineId === lineId);

        let newItems: CartLineItem[];
        if (existingIndex >= 0) {
          newItems = [...state.items];
          const existing = newItems[existingIndex]!;
          newItems[existingIndex] = {
            ...existing,
            quantity: existing.quantity + item.quantity,
          };
        } else {
          newItems = [
            ...state.items,
            {
              lineId,
              menuItemId: item.menuItemId,
              variantId: item.variantId,
              variantName: item.variantName,
              selectedOptionIds,
              selectedOptionNames,
              quantity: item.quantity,
              name: item.name,
              basePricePaise: item.basePricePaise,
              optionsPricePaise,
              unitPricePaise,
              instructions: item.instructions,
              imageUrl: item.imageUrl,
            },
          ];
        }

        set({
          restaurantId: item.restaurantId,
          restaurantName: item.restaurantName,
          restaurantSlug: item.restaurantSlug,
          items: newItems,
        });

        return { success: true };
      },

      updateQuantity: (lineId, quantity) => {
        const state = get();
        if (quantity <= 0) {
          get().removeItem(lineId);
          return;
        }

        const newItems = state.items.map((i) =>
          i.lineId === lineId ? { ...i, quantity } : i
        );
        set({ items: newItems });
      },

      removeItem: (lineId) => {
        const state = get();
        const newItems = state.items.filter((i) => i.lineId !== lineId);
        if (newItems.length === 0) {
          set({
            restaurantId: null,
            restaurantName: null,
            restaurantSlug: null,
            items: [],
          });
        } else {
          set({ items: newItems });
        }
      },

      clearCart: () => {
        set({
          restaurantId: null,
          restaurantName: null,
          restaurantSlug: null,
          items: [],
          instructions: "",
        });
      },

      setInstructions: (instructions) => set({ instructions }),

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getSubtotalPaise: () => {
        return get().items.reduce(
          (sum, item) => sum + item.unitPricePaise * item.quantity,
          0
        );
      },
    }),
    {
      name: "food_delivery_cart_v1",
    }
  )
);

"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { useLanguageStore } from "@/features/i18n/language-store";

interface PersistedStore {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
    rehydrate: () => Promise<void> | void;
  };
}

/**
 * Persisted stores are created with `skipHydration` so the server render and the
 * first client render agree (both empty). They load from localStorage right after
 * mount; components that would otherwise flash an empty state wait on this.
 */
export function usePersistHydrated(store: PersistedStore): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsubscribe = store.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(store.persist.hasHydrated());
    return unsubscribe;
  }, [store]);
  return hydrated;
}

export function rehydrateClientStores(): void {
  void useCartStore.persist.rehydrate();
  void useLocationStore.persist.rehydrate();
  void useLanguageStore.persist.rehydrate();
}

export const useCartHydrated = () => usePersistHydrated(useCartStore);
export const useLocationHydrated = () => usePersistHydrated(useLocationStore);

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "./messages";

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language) => set({ language }),
    }),
    { name: "bitebox_language_v1", skipHydration: true }
  )
);

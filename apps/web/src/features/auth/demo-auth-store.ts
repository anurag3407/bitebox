"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UserRole } from "@startup/contracts";

export interface DemoPersona {
  key: "customer" | "merchant" | "rider" | "admin";
  name: string;
  role: UserRole;
  token: string;
  home: string;
}

/** Development-only personas; the server refuses these tokens in staging/production. */
export const DEMO_PERSONAS: DemoPersona[] = [
  { key: "customer", name: "Rahul Sharma", role: UserRole.CUSTOMER, token: "demo_customer", home: "/" },
  { key: "merchant", name: "Chef Vikram Anand", role: UserRole.MERCHANT_STAFF, token: "demo_merchant", home: "/merchant" },
  { key: "rider", name: "Amit Kumar", role: UserRole.RIDER, token: "demo_rider", home: "/rider" },
  { key: "admin", name: "Siddharth Operations", role: UserRole.ADMIN, token: "demo_admin", home: "/admin" },
];

interface DemoAuthState {
  persona: DemoPersona | null;
  signIn: (key: DemoPersona["key"]) => DemoPersona | null;
  signOut: () => void;
}

export const useDemoAuthStore = create<DemoAuthState>()(
  persist(
    (set) => ({
      persona: null,
      signIn: (key) => {
        const persona = DEMO_PERSONAS.find((p) => p.key === key) ?? null;
        set({ persona });
        return persona;
      },
      signOut: () => set({ persona: null }),
    }),
    { name: "food_delivery_demo_auth_v2", skipHydration: true }
  )
);

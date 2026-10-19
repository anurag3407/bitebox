"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UserRole } from "@startup/contracts";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  demoToken: string;
}

export const DEMO_USERS: Record<string, UserProfile> = {
  customer: {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Rahul Sharma",
    email: "customer@example.com",
    phone: "+919876543210",
    role: UserRole.CUSTOMER,
    demoToken: "demo_customer",
  },
  merchant: {
    id: "30000000-0000-4000-8000-000000000002",
    name: "Chef Vikram Anand",
    email: "merchant@example.com",
    phone: "+919876543211",
    role: UserRole.MERCHANT_STAFF,
    demoToken: "demo_merchant",
  },
  rider: {
    id: "30000000-0000-4000-8000-000000000003",
    name: "Amit Kumar (Delivery Partner)",
    email: "rider@example.com",
    phone: "+919876543212",
    role: UserRole.RIDER,
    demoToken: "demo_rider",
  },
  admin: {
    id: "30000000-0000-4000-8000-000000000004",
    name: "Siddharth Operations",
    email: "admin@example.com",
    phone: "+919876543213",
    role: UserRole.ADMIN,
    demoToken: "demo_admin",
  },
};

interface AuthState {
  currentUser: UserProfile;
  setUser: (userKey: keyof typeof DEMO_USERS) => void;
  getToken: () => string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: DEMO_USERS.customer!,
      setUser: (userKey) => {
        const user = DEMO_USERS[userKey];
        if (user) {
          set({ currentUser: user });
        }
      },
      getToken: () => {
        return get().currentUser.demoToken;
      },
    }),
    {
      name: "food_delivery_auth_v1",
    }
  )
);

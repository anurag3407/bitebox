"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AddressDto, Coordinate } from "@startup/contracts";

interface LocationState {
  // Where the customer wants food delivered; null until chosen
  location: Coordinate | null;
  label: string | null;
  // Saved address backing the location (needed for checkout); null for a raw GPS/search pin
  addressId: string | null;
  setPin: (coord: Coordinate, label: string) => void;
  setAddress: (address: AddressDto) => void;
  clear: () => void;
}

export function addressLabel(address: Pick<AddressDto, "building" | "street">): string {
  return [address.building, address.street].filter(Boolean).join(", ");
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      location: null,
      label: null,
      addressId: null,
      setPin: (location, label) => set({ location, label, addressId: null }),
      setAddress: (address) =>
        set({
          location: { latitude: address.latitude, longitude: address.longitude },
          label: addressLabel(address),
          addressId: address.id,
        }),
      clear: () => set({ location: null, label: null, addressId: null }),
    }),
    {
      name: "food_delivery_location_v2",
      version: 2,
      skipHydration: true,
      // v1 shipped a hard-coded demo address for everyone; drop it
      migrate: () => ({ location: null, label: null, addressId: null }),
    }
  )
);

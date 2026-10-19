"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AddressDto, Coordinate } from "@startup/contracts";

interface LocationState {
  currentLocation: Coordinate;
  locationLabel: string;
  selectedAddress: AddressDto | null;
  setLocation: (coord: Coordinate, label: string) => void;
  setSelectedAddress: (address: AddressDto) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      currentLocation: {
        latitude: 28.6315,
        longitude: 77.2167,
      },
      locationLabel: "Connaught Place, Central Delhi",
      selectedAddress: {
        id: "40000000-0000-4000-8000-000000000001",
        label: "Home",
        building: "Flat 402, Royal Residency",
        street: "Barakhamba Road, Connaught Place",
        landmark: "Near Metro Station",
        latitude: 28.6315,
        longitude: 77.2167,
        isDefault: true,
        contactPhone: "+919876543210",
      },
      setLocation: (currentLocation, locationLabel) =>
        set({ currentLocation, locationLabel }),
      setSelectedAddress: (selectedAddress) =>
        set({
          selectedAddress,
          currentLocation: {
            latitude: selectedAddress.latitude,
            longitude: selectedAddress.longitude,
          },
          locationLabel: `${selectedAddress.building}, ${selectedAddress.street}`,
        }),
    }),
    {
      name: "food_delivery_location_v1",
    }
  )
);

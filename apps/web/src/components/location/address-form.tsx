"use client";

import React, { useState } from "react";
import { AddressDto, Coordinate } from "@startup/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, useApi } from "@/lib/api";
import { Spinner } from "@/components/ui/misc";

const LABELS = ["Home", "Work", "Hotel", "Other"];

interface AddressFormProps {
  location: Coordinate;
  locationLabel?: string;
  initial?: AddressDto;
  onSaved: (address: AddressDto) => void;
}

/** Complete address details for a chosen map location (riders need flat/floor, not just a pin). */
export function AddressForm({ location, locationLabel, initial, onSaved }: AddressFormProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(initial?.label ?? "Home");
  const [building, setBuilding] = useState(initial?.building ?? "");
  const [street, setStreet] = useState(initial?.street ?? locationLabel ?? "");
  const [landmark, setLandmark] = useState(initial?.landmark ?? "");
  const [phone, setPhone] = useState(initial?.contactPhone?.replace(/^\+91/, "") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label,
        building: building.trim(),
        street: street.trim(),
        landmark: landmark.trim() || undefined,
        latitude: location.latitude,
        longitude: location.longitude,
        contactPhone: phone.trim() || undefined,
        isDefault: !initial,
      };
      const saved = initial ? await api.updateAddress(initial.id, payload) : await api.createAddress(payload);
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full p-3 bg-surface-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {LABELS.map((l) => (
          <button
            type="button"
            key={l}
            onClick={() => setLabel(l)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${label === l ? "bg-brand-light border-brand text-brand" : "border-border"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <label className="block text-xs font-semibold text-text-secondary">
        Flat / House no. / Floor / Building *
        <input required maxLength={120} value={building} onChange={(e) => setBuilding(e.target.value)} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-text-secondary">
        Area / Street / Locality *
        <input required maxLength={200} value={street} onChange={(e) => setStreet(e.target.value)} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-text-secondary">
        Nearby landmark (optional)
        <input maxLength={120} value={landmark} onChange={(e) => setLandmark(e.target.value)} className={`${input} mt-1`} />
      </label>
      <label className="block text-xs font-semibold text-text-secondary">
        Phone for the delivery partner (optional)
        <div className="flex mt-1">
          <span className="px-3 flex items-center bg-surface-muted border border-r-0 border-border rounded-l-xl text-sm">+91</span>
          <input
            inputMode="numeric"
            pattern="[6-9][0-9]{9}"
            title="10-digit mobile number"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            className={`${input} rounded-l-none`}
          />
        </div>
      </label>
      {error && <p className="text-xs text-red-700 font-medium">{error}</p>}
      <button disabled={saving} className="w-full py-3 bg-brand hover:bg-brand-hover text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
        {saving && <Spinner />} Save address & continue
      </button>
    </form>
  );
}

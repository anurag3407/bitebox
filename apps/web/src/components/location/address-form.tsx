"use client";

import React, { useState } from "react";
import { AddressDto, Coordinate } from "@startup/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, useApi } from "@/lib/api";
import { Field, PhoneInput } from "@/components/ui/field";
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

  return (
    <form onSubmit={submit} className="space-y-5 pb-2">
      <div>
        <span className="label">Save as</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Address label">
          {LABELS.map((l) => (
            <button type="button" role="radio" aria-checked={label === l} key={l} onClick={() => setLabel(l)} className="chip">
              {l}
            </button>
          ))}
        </div>
      </div>
      <Field label="Flat, house no., floor, building">
        <input required maxLength={120} value={building} onChange={(e) => setBuilding(e.target.value)} className="input" placeholder="e.g. Flat 402, Tower B" />
      </Field>
      <Field label="Area, street, locality">
        <input required maxLength={200} value={street} onChange={(e) => setStreet(e.target.value)} className="input" />
      </Field>
      <Field label="Landmark" hint="Optional, but it helps your delivery partner.">
        <input maxLength={120} value={landmark} onChange={(e) => setLandmark(e.target.value)} className="input" placeholder="e.g. Opposite the metro gate" />
      </Field>
      <Field label="Phone for delivery" hint="Optional. Used only if the partner can't find you.">
        <PhoneInput value={phone} onChange={setPhone} />
      </Field>
      {error && <p className="notice notice-danger">{error}</p>}
      <button disabled={saving} className="btn btn-primary btn-lg btn-block">
        {saving && <Spinner />} Save address
      </button>
    </form>
  );
}

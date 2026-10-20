"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddressDto, Coordinate } from "@startup/contracts";
import { Crosshair, MapPin, Search, Home, Briefcase } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { addressLabel, useLocationStore } from "@/features/location/location-store";
import { errorMessage, useApi } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { AddressForm } from "./address-form";

interface LocationSheetProps {
  open: boolean;
  onClose: () => void;
  // Checkout needs a saved address (with flat number), not just a pin
  requireSavedAddress?: boolean;
}

export function LocationSheet({ open, onClose, requireSavedAddress }: LocationSheetProps) {
  const api = useApi();
  const toast = useToast();
  const { isSignedIn } = useAuth();
  const { setAddress, setPin } = useLocationStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ label: string; latitude: number; longitude: number }>>([]);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [locating, setLocating] = useState(false);
  const [draft, setDraft] = useState<{ location: Coordinate; label?: string } | null>(null);

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.getAddresses(),
    enabled: open && isSignedIn,
  });

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.geocode({ q: query.trim() });
        setResults(res.results);
        setSearchEnabled(res.enabled);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, api]);

  const choosePoint = async (location: Coordinate, label?: string) => {
    const check = await api.checkServiceability(location).catch(() => null);
    if (check && !check.isServiceable) {
      toast(check.reason ?? "We don't deliver here yet.", "error");
      return;
    }
    if (requireSavedAddress && isSignedIn) {
      setDraft({ location, label });
      return;
    }
    setPin(location, label ?? "Pinned location");
    onClose();
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      const rev = await api.geocode({ latitude: pos.latitude, longitude: pos.longitude }).catch(() => null);
      await choosePoint(pos, rev?.results[0]?.label ?? "Current location");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLocating(false);
    }
  };

  const pickSaved = (address: AddressDto) => {
    setAddress(address);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft ? "Add address details" : "Choose delivery location"}
      description={draft ? draft.label : "We'll show restaurants that deliver here"}
    >
      {draft ? (
        <AddressForm
          location={draft.location}
          locationLabel={draft.label}
          onSaved={(address) => {
            setAddress(address);
            toast("Address saved", "success");
            onClose();
          }}
        />
      ) : (
        <div className="space-y-5">
          <button
            onClick={useCurrentLocation}
            disabled={locating}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-brand/30 bg-brand-light/40 text-brand font-bold text-sm"
          >
            {locating ? <Spinner /> : <Crosshair className="w-5 h-5" />}
            Use my current location
          </button>

          <div className="relative">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-3.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for area, street name..."
              className="w-full pl-9 pr-3 py-3 bg-surface-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {!searchEnabled && query.length >= 3 && (
              <p className="text-[11px] text-text-secondary mt-1">Address search is not configured; use your current location.</p>
            )}
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-border border border-border rounded-xl overflow-hidden">
                {results.map((r) => (
                  <li key={`${r.latitude},${r.longitude}`}>
                    <button onClick={() => choosePoint(r, r.label)} className="w-full text-left p-3 text-sm hover:bg-surface-muted flex gap-2">
                      <MapPin className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" />
                      <span>{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isSignedIn && (addresses.data?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Saved addresses</h3>
              <ul className="space-y-2">
                {addresses.data!.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => pickSaved(a)} className="w-full text-left p-3 rounded-xl border border-border hover:border-brand flex gap-3">
                      {a.label === "Work" ? <Briefcase className="w-4 h-4 mt-0.5 text-text-secondary" /> : <Home className="w-4 h-4 mt-0.5 text-text-secondary" />}
                      <span>
                        <span className="block text-sm font-bold text-text-primary">{a.label}</span>
                        <span className="block text-xs text-text-secondary">{addressLabel(a)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

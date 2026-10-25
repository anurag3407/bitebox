"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddressDto, Coordinate } from "@startup/contracts";
import { Briefcase, ChevronRight, Home, LocateFixed, MapPin, Search } from "lucide-react";
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
  const { setAddress, setPin, addressId } = useLocationStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ label: string; latitude: number; longitude: number }>>([]);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [searching, setSearching] = useState(false);
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
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.geocode({ q: query.trim() });
        if (cancelled) return;
        setResults(res.results);
        setSearchEnabled(res.enabled);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
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

  const row = "flex w-full items-center gap-4 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-subtle";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft ? "Address details" : "Where should we deliver?"}
      description={draft ? draft.label : "We'll show restaurants that deliver to you."}
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
        <div className="space-y-6 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for an area or street"
              aria-label="Search for an area or street"
              className="input pl-11"
            />
            {searching && <Spinner className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />}
          </div>

          {!searchEnabled && query.length >= 3 && <p className="text-sm text-ink-muted">Address search isn&apos;t configured here. Use your current location instead.</p>}

          {results.length > 0 ? (
            <ul className="-mx-3">
              {results.map((r) => (
                <li key={`${r.latitude},${r.longitude}`}>
                  <button onClick={() => choosePoint(r, r.label)} className={row}>
                    <MapPin className="h-5 w-5 shrink-0 text-ink-muted" />
                    <span className="text-sm text-ink">{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button onClick={useCurrentLocation} disabled={locating} className={`${row} -mx-3 w-[calc(100%+1.5rem)] disabled:opacity-60`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                {locating ? <Spinner /> : <LocateFixed className="h-5 w-5" />}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">Use my current location</span>
                <span className="block text-xs text-ink-muted">Using GPS</span>
              </span>
              <ChevronRight className="h-4 w-4 text-ink-muted" />
            </button>
          )}

          {isSignedIn && (addresses.data?.length ?? 0) > 0 && results.length === 0 && (
            <div>
              <h3 className="eyebrow mb-2">Saved addresses</h3>
              <ul className="-mx-3">
                {addresses.data!.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => pickSaved(a)} className={row}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-soft">
                        {a.label === "Work" ? <Briefcase className="h-4 w-4" /> : <Home className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{a.label}</span>
                        <span className="block truncate text-xs text-ink-muted">{addressLabel(a)}</span>
                      </span>
                      {a.id === addressId && <span className="badge badge-ink">Selected</span>}
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

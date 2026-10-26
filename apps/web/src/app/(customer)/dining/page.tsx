"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, MapPin, Search, Star, UtensilsCrossed } from "lucide-react";
import { EmptyState, SafeImage, PageSpinner } from "@/components/ui/misc";
import { useLocationStore } from "@/features/location/location-store";
import { useLocationHydrated } from "@/features/hydration";
import { useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const CUISINES = ["North Indian", "Chinese", "Italian", "South Indian", "Biryani", "Continental", "Bakery"];

export default function DiningPage() {
  const api = useApi();
  const { location } = useLocationStore();
  const locationReady = useLocationHydrated();
  const [cuisine, setCuisine] = useState<string | undefined>();
  const [q, setQ] = useState("");

  const restaurants = useQuery({
    queryKey: ["dining-restaurants", location, cuisine],
    queryFn: () => api.getDiningRestaurants({ latitude: location?.latitude, longitude: location?.longitude, cuisine }),
    enabled: locationReady,
  });

  const list = useMemo(() => {
    const all = restaurants.data ?? [];
    if (!q.trim()) return all;
    const needle = q.trim().toLowerCase();
    return all.filter((r) => r.name.toLowerCase().includes(needle) || r.cuisines.some((c) => c.toLowerCase().includes(needle)));
  }, [restaurants.data, q]);

  return (
    <div className="pb-20">
      <section className="bg-ink text-white">
        <div className="page py-14 sm:py-20">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/55">
            <UtensilsCrossed className="h-3.5 w-3.5" /> BiteBox Dining
          </p>
          <div className="mt-5 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                A table worth
                <br />
                leaving home for.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/60">
                Reserve the city’s best tables in seconds. Free, instant confirmation, no prepayment.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Real-time slots
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {location ? "Near you" : "Set your location"}
              </span>
            </div>
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="mt-10 flex h-14 max-w-2xl items-center gap-3 rounded-full bg-white px-5 shadow-pop"
          >
            <Search className="h-5 w-5 shrink-0 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search restaurants, cuisines…"
              aria-label="Search dining restaurants"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
            />
            <Link href="/" className="hidden shrink-0 text-sm font-medium text-ink-soft hover:text-ink sm:block">
              Order delivery
            </Link>
          </form>
        </div>
      </section>

      <div className="page">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pt-8 sm:mx-0 sm:px-0">
          <button onClick={() => setCuisine(undefined)} aria-pressed={!cuisine} className="chip">
            All cuisines
          </button>
          {CUISINES.map((c) => (
            <button key={c} onClick={() => setCuisine(cuisine === c ? undefined : c)} aria-pressed={cuisine === c} className="chip">
              {c}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-baseline justify-between gap-4">
          <h2 className="h-section">Tables available near you</h2>
          {list.length > 0 && <p className="text-sm text-ink-muted">{list.length} restaurants</p>}
        </div>

        {restaurants.isPending ? (
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-72" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={<UtensilsCrossed />} title="No tables found" body="Try another cuisine or search term." />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r) => (
              <Link key={r.id} href={`/dining/${r.id}`} className="group block">
                <div className="relative overflow-hidden rounded-[24px] bg-subtle">
                  <SafeImage src={r.heroImageUrl} alt={r.name} className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink backdrop-blur">
                    <Star className="h-3 w-3 fill-ink" /> {r.rating.toFixed(1)}
                  </span>
                  {r.distanceMeters !== undefined && (
                    <span className="absolute right-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                      {(r.distanceMeters / 1000).toFixed(1)} km
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[17px] font-semibold tracking-tight text-ink">{r.name}</h3>
                      <p className="mt-1 truncate text-sm text-ink-muted">{r.cuisines.join(" · ")}</p>
                    </div>
                    <span className="shrink-0 text-sm text-ink-muted tabular">{formatRupees(r.avgPriceForOnePaise)} for one</span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm text-ink-soft">{r.diningDescription ?? r.addressText}</p>
                  <span className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink">
                    Book a table <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

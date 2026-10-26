"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Mic, Search, Store, UtensilsCrossed, X } from "lucide-react";
import { RestaurantCard, RestaurantCardSkeleton } from "@/components/discovery/RestaurantCard";
import { EmptyState, SafeImage, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useLocationStore } from "@/features/location/location-store";
import { useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

const SUGGESTIONS = ["Biryani", "Paneer", "Burger", "Dosa", "Chaat", "Butter chicken"];

interface SpeechResultEvent {
  results?: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function SearchContent() {
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const location = useLocationStore((s) => s.location);
  const [input, setInput] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [vegOnly, setVegOnly] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setVegOnly(localStorage.getItem("bitebox_veg_only") === "true");
    try {
      const saved = JSON.parse(localStorage.getItem("bitebox_recent_searches") ?? "[]");
      if (Array.isArray(saved)) setRecent(saved.filter((s): s is string => typeof s === "string").slice(0, 6));
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    if (query.length < 2) return;
    setRecent((prev) => {
      const next = [query, ...prev.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 6);
      localStorage.setItem("bitebox_recent_searches", JSON.stringify(next));
      return next;
    });
  }, [query]);

  const toggleVeg = () => {
    setVegOnly((v) => {
      localStorage.setItem("bitebox_veg_only", String(!v));
      return !v;
    });
  };
  const clearRecent = () => {
    localStorage.removeItem("bitebox_recent_searches");
    setRecent([]);
  };

  const suggestions = useQuery({
    queryKey: ["search-suggestions", input],
    queryFn: () => api.getSearchSuggestions(input.trim()),
    enabled: focused && input.trim().length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      const next = input.trim();
      setQuery(next);
      if (next !== (params.get("q") ?? "")) router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search", { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [input, router, params]);

  const results = useQuery({
    queryKey: ["search", query, location, vegOnly],
    queryFn: () => api.search(query, location ?? undefined, vegOnly),
    enabled: query.length >= 2,
    placeholderData: (prev) => prev,
  });

  const startVoiceSearch = () => {
    if (listening) return;
    const speech = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Recognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
    if (!Recognition) {
      toast("Voice search isn't supported in this browser yet.", "info");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInput(transcript);
        setQuery(transcript);
      }
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      toast("Couldn't hear that. Try again or type your search.", "error");
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <div className="page pb-16 pt-8 sm:pt-14">
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
          <input
            autoFocus
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            placeholder="Search dishes or restaurants"
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="search-suggestions"
            className="h-14 w-full rounded-full border border-line bg-white pl-14 pr-24 text-base text-ink shadow-soft outline-none transition placeholder:text-ink-muted focus:border-ink sm:h-16 sm:text-lg"
          />
          {input && (
            <button onClick={() => setInput("")} aria-label="Clear search" className="btn btn-ghost btn-icon absolute right-12 top-1/2 h-9 w-9 -translate-y-1/2">
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={startVoiceSearch}
            aria-label={listening ? "Listening for your search" : "Search by voice"}
            disabled={listening}
            className={`btn btn-ghost btn-icon absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 ${listening ? "animate-pulse text-danger" : ""}`}
          >
            <Mic className="h-4 w-4" />
          </button>
          {focused && input.trim().length >= 2 && (suggestions.data?.length ?? 0) > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              onMouseDown={(e) => e.preventDefault()}
              className="absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-3xl border border-line bg-white py-2 shadow-pop"
            >
              {suggestions.data!.map((s) => (
                <li key={`${s.type}-${s.text}`} role="option" aria-selected={false}>
                  <button
                    onClick={() => {
                      if (s.type === "restaurant" && s.targetSlug) router.push(`/restaurants/${s.targetSlug}`);
                      else {
                        setInput(s.text);
                        setQuery(s.text);
                      }
                      setFocused(false);
                    }}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-soft">
                      {s.type === "restaurant" ? <Store className="h-4 w-4" /> : s.type === "dish" ? <UtensilsCrossed className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{s.text}</span>
                      <span className="block text-xs capitalize text-ink-muted">
                        {s.type === "restaurant" ? "Restaurant" : s.type === "dish" ? "Dish" : "Cuisine"}
                      </span>
                    </span>
                    <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          <button onClick={toggleVeg} aria-pressed={vegOnly} className="chip">
            Veg only
          </button>
          {query.length < 2 &&
            SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="chip">
                {s}
              </button>
            ))}
        </div>
        {query.length < 2 && recent.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Recent searches</p>
              <button onClick={clearRecent} className="text-xs text-ink-muted hover:text-ink">
                Clear
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recent.map((q) => (
                <button key={q} onClick={() => setInput(q)} className="chip">
                  <Search className="h-3.5 w-3.5" /> {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {query.length < 2 ? (
        <p className="mt-20 text-center text-sm text-ink-muted">Try a dish, a cuisine or a restaurant name.</p>
      ) : (
        <div className="mt-14 space-y-16">
          {results.isPending ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <RestaurantCardSkeleton key={n} />
              ))}
            </div>
          ) : !results.data?.restaurants.length && !results.data?.dishes.length ? (
            <EmptyState
              icon={<Search />}
              title={`No results for “${query}”`}
              body={location ? "Nothing that delivers to you matches. Try another dish." : "Check the spelling or try another dish."}
            />
          ) : (
            <>
              {results.data.dishes.length > 0 && (
                <section>
                  <h2 className="h-section">Dishes</h2>
                  <ul className="mt-6 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    {results.data.dishes.map(({ dish, restaurant }) => (
                      <li key={dish.id} className="border-b border-line">
                        <Link href={`/restaurants/${restaurant.slug}`} className={`group flex items-center gap-5 py-5 ${!dish.isAvailable ? "opacity-50" : ""}`}>
                          <SafeImage src={dish.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <VegMark tag={dish.dietaryTag} />
                              <p className="truncate font-medium text-ink group-hover:underline group-hover:underline-offset-4">{dish.name}</p>
                            </div>
                            <p className="mt-1 text-sm text-ink tabular">{formatRupees(dish.pricePaise)}</p>
                            <p className="mt-0.5 truncate text-sm text-ink-muted">
                              {restaurant.name}
                              {!dish.isAvailable && " · Sold out"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {results.data.restaurants.length > 0 && (
                <section>
                  <h2 className="h-section">Restaurants</h2>
                  <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {results.data.restaurants.map((r) => (
                      <RestaurantCard key={r.id} restaurant={r} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}

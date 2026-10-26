"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import { useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";
import { EmptyState, PageSpinner, SafeImage } from "@/components/ui/misc";

const CATEGORY_LABEL: Record<string, string> = {
  DINING: "Chef's table",
  MUSIC: "Music",
  COMEDY: "Comedy",
  WORKSHOP: "Workshop",
};

export default function EventsPage() {
  const api = useApi();
  const events = useQuery({ queryKey: ["dining-events"], queryFn: () => api.getDiningEvents() });

  return (
    <div className="page pb-20 pt-8">
      <div className="overflow-hidden rounded-[32px] bg-ink px-6 py-10 text-white sm:px-10 sm:py-14">
        <p className="eyebrow flex items-center gap-2 text-white/60">
          <Sparkles className="h-3.5 w-3.5" /> BiteBox Live
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
          Dinner, shows and things worth leaving home for.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
          Ticketed chef tables, tastings and rooftop sets at the city&apos;s best kitchens. Pay with BiteBox Credits — your
          seat is confirmed instantly.
        </p>
        <div className="mt-7 flex flex-wrap gap-5 text-xs text-white/60">
          <span className="flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" /> Instant ticket code</span>
          <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Free cancellation up to 2 hours before</span>
        </div>
      </div>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Upcoming experiences</h2>
          <p className="mt-1 text-sm text-ink-muted">Small rooms, limited seats.</p>
        </div>
        {events.data && events.data.length > 0 && (
          <span className="badge badge-neutral">{events.data.length} events</span>
        )}
      </div>

      {events.isLoading ? (
        <PageSpinner />
      ) : events.isError ? (
        <EmptyState
          icon={<Ticket />}
          title="Couldn't load events"
          body="Check your connection and try again."
          action={<button onClick={() => events.refetch()} className="btn btn-primary">Try again</button>}
        />
      ) : events.data?.length === 0 ? (
        <EmptyState
          icon={<Ticket />}
          title="No events on sale right now"
          body="New chef tables and rooftop shows are announced every week. Check back soon."
          action={<Link href="/" className="btn btn-primary">Browse restaurants</Link>}
        />
      ) : (
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.data!.map((event) => (
            <li key={event.id}>
              <Link href={`/events/${event.id}`} className="group block overflow-hidden rounded-3xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <SafeImage src={event.imageUrl} alt={event.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  <span className="absolute left-4 top-4 badge bg-white/95 text-ink">{CATEGORY_LABEL[event.category] ?? event.category}</span>
                  <span className={`absolute right-4 top-4 badge ${event.seatsLeft <= 4 ? "badge-danger" : "bg-white/95 text-ink"}`}>
                    {event.seatsLeft === 0 ? "Sold out" : `${event.seatsLeft} seats left`}
                  </span>
                </div>
                <div className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent">{formatDateTime(event.startsAt)}</p>
                  <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{event.title}</h3>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{event.restaurantName} · {event.venue}</span>
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink tabular">{formatRupees(event.pricePaise)} <span className="font-normal text-ink-muted">/ ticket</span></span>
                    <span className="flex items-center gap-1 text-xs text-ink-muted"><Users className="h-3.5 w-3.5" /> {event.capacity} seats</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

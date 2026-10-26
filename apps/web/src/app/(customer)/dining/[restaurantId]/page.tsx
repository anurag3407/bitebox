"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Download,
  MapPin,
  Minus,
  Plus,
  Star,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState, PageSpinner, SafeImage, Spinner, VegMark } from "@/components/ui/misc";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { DiningReservationDto } from "@startup/api-client";

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function dateChip(date: string) {
  const d = new Date(`${date}T12:00:00+05:30`);
  return {
    weekday: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }),
    day: d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }),
    month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" }),
  };
}

function prettySlot(slot: string): string {
  const [h = 0, m = 0] = slot.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function icsFile(reservation: DiningReservationDto): string {
  const start = new Date(`${reservation.date}T${reservation.slot}:00+05:30`);
  const end = new Date(start.getTime() + 90 * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BiteBox//Dining//EN",
    "BEGIN:VEVENT",
    `UID:${reservation.id}@bitebox`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Table at ${reservation.restaurantName} (BiteBox)`,
    `LOCATION:${reservation.restaurantAddress.replace(/,/g, "\\,")}`,
    `DESCRIPTION:Confirmation ${reservation.confirmationCode}. Party of ${reservation.partySize}.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

const OCCASIONS = [
  { value: "", label: "Just dining" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "DATE_NIGHT", label: "Date night" },
  { value: "BUSINESS", label: "Business" },
  { value: "FAMILY", label: "Family" },
];

export default function DiningBookingPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params.restaurantId;
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [date, setDate] = useState(istToday());
  const [partySize, setPartySize] = useState(2);
  const [slot, setSlot] = useState<string | null>(null);
  const [occasion, setOccasion] = useState("");
  const [request, setRequest] = useState("");
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<DiningReservationDto | null>(null);

  const availability = useQuery({
    queryKey: ["dining-availability", restaurantId, date],
    queryFn: () => api.getDiningAvailability(restaurantId, date),
    enabled: !!restaurantId && !confirmed,
  });

  const dates = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(istToday(), i)), []);
  const restaurant = availability.data?.restaurant;

  if (confirmed) {
    return (
      <div className="page-narrow py-16 sm:py-24">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Check className="h-8 w-8" />
          </span>
          <p className="eyebrow mt-7">Table confirmed</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">{confirmed.restaurantName}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {new Date(`${confirmed.date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Asia/Kolkata",
            })}{" "}
            · {prettySlot(confirmed.slot)} · {confirmed.partySize} guests
          </p>
        </div>
        <div className="mt-10 rounded-[28px] border border-line p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-ink-muted">Confirmation code</p>
              <p className="mt-1 text-2xl font-semibold tracking-[0.14em] text-ink">{confirmed.confirmationCode}</p>
            </div>
            <span className="badge badge-success">Instant confirmation</span>
          </div>
          <div className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
            <p className="flex items-start gap-3 text-ink-soft">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {confirmed.restaurantAddress}
            </p>
            {confirmed.specialRequest && <p className="text-ink-muted">Request: {confirmed.specialRequest}</p>}
            <p className="text-ink-muted">Show this code at the host desk. Running late? Call the restaurant.</p>
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFile(confirmed))}`}
              download={`bitebox-${confirmed.confirmationCode}.ics`}
              className="btn btn-outline flex-1"
            >
              <Download className="h-4 w-4" /> Add to calendar
            </a>
            <button onClick={() => router.push("/account?tab=dining")} className="btn btn-primary flex-1">
              View all bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) return <PageSpinner />;

  if (availability.isPending) {
    return (
      <div className="page py-10">
        <div className="skeleton h-8 w-40" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_440px]">
          <div className="skeleton h-96" />
          <div className="skeleton h-96" />
        </div>
      </div>
    );
  }

  if (availability.isError || !restaurant) {
    return (
      <EmptyState
        icon={<UtensilsCrossed />}
        title="Restaurant unavailable"
        body={errorMessage(availability.error, "We couldn't load this restaurant.")}
        action={
          <Link href="/dining" className="btn btn-primary">
            Browse dining
          </Link>
        }
      />
    );
  }

  const canBook = !!slot && isSignedIn && !booking;

  return (
    <div className="page pb-24 pt-8 sm:pt-12">
      <Link href="/dining" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Dine out
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_440px] lg:gap-14">
        <div>
          <div className="overflow-hidden rounded-[28px]">
            <SafeImage src={restaurant.heroImageUrl} alt={restaurant.name} className="aspect-[16/9] w-full object-cover" />
          </div>
          <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{restaurant.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                {restaurant.cuisines.join(" · ")}
                {restaurant.pureVeg && (
                  <span className="inline-flex items-center gap-1">
                    · <VegMark tag="VEG" /> Pure veg
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-2xl bg-subtle px-4 py-3 text-center">
              <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                <Star className="h-3.5 w-3.5 fill-ink" /> {restaurant.rating.toFixed(1)}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-muted">{restaurant.ratingCount}+ ratings</span>
            </div>
          </div>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-soft">
            {restaurant.diningDescription ?? "A neighbourhood favourite. Book a table and skip the queue."}
          </p>
          <dl className="mt-7 grid gap-4 border-t border-line pt-6 text-sm sm:grid-cols-2">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <div>
                <dt className="text-ink-muted">Address</dt>
                <dd className="mt-0.5 text-ink">{restaurant.addressText}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              <div>
                <dt className="text-ink-muted">Average cost</dt>
                <dd className="mt-0.5 text-ink">{formatRupees(restaurant.avgPriceForOnePaise * 2)} for two</dd>
              </div>
            </div>
          </dl>
          <div className="mt-8 rounded-2xl bg-accent-soft p-5 text-sm leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">Free reservations.</span> No prepayment, no cancellation fee. Your table is held
            for 15 minutes past the booking time.
          </div>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="card p-6 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <CalendarDays className="h-4 w-4" /> Book a table
            </h2>

            <div className="mt-6">
              <p className="label">Date</p>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {dates.map((d) => {
                  const chip = dateChip(d);
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        setDate(d);
                        setSlot(null);
                      }}
                      aria-pressed={date === d}
                      className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition ${
                        date === d ? "border-ink bg-ink text-white" : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wide opacity-70">{chip.weekday}</span>
                      <span className="text-lg font-semibold tabular">{chip.day}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div>
                <p className="label mb-1">Guests</p>
                <p className="text-xs text-ink-muted">Up to {restaurant.maxPartySize} per booking</p>
              </div>
              <div className="stepper h-11">
                <button aria-label="Fewer guests" onClick={() => setPartySize((n) => Math.max(1, n - 1))}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="flex min-w-9 items-center justify-center gap-1 tabular">
                  <Users className="h-3.5 w-3.5 text-ink-muted" /> {partySize}
                </span>
                <button
                  aria-label="More guests"
                  onClick={() => setPartySize((n) => Math.min(restaurant.maxPartySize, n + 1))}
                  disabled={partySize >= restaurant.maxPartySize}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-6">
              <p className="label">Time</p>
              <div className="grid grid-cols-4 gap-2">
                {availability.data.slots
                  .filter((s) => s.isAvailable)
                  .map((s) => (
                    <button
                      key={s.slot}
                      onClick={() => setSlot(s.slot)}
                      aria-pressed={slot === s.slot}
                      className={`h-10 rounded-xl border text-[13px] font-medium tabular transition ${
                        slot === s.slot ? "border-ink bg-ink text-white" : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      {prettySlot(s.slot)}
                    </button>
                  ))}
              </div>
              {availability.data.slots.every((s) => !s.isAvailable) && (
                <p className="mt-3 text-sm text-ink-muted">No slots left for this day. Try another date.</p>
              )}
            </div>

            <div className="mt-6">
              <p className="label">Occasion</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {OCCASIONS.map((o) => (
                  <button key={o.value} onClick={() => setOccasion(o.value)} aria-pressed={occasion === o.value} className="chip h-9">
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Special request" hint="Window table, cake, high chair…" className="mt-6">
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                maxLength={300}
                rows={2}
                className="input"
                placeholder="Anything the restaurant should know?"
              />
            </Field>

            {!isSignedIn ? (
              <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/dining/${restaurantId}`)}`} className="btn btn-primary btn-lg btn-block mt-6">
                Sign in to book
              </Link>
            ) : (
              <button
                disabled={!canBook}
                onClick={async () => {
                  if (!slot) return;
                  setBooking(true);
                  try {
                    const reservation = await api.createDiningReservation({
                      restaurantId,
                      date,
                      slot,
                      partySize,
                      occasion: occasion || undefined,
                      specialRequest: request.trim() || undefined,
                    });
                    setConfirmed(reservation);
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  } finally {
                    setBooking(false);
                  }
                }}
                className="btn btn-primary btn-lg btn-block mt-6"
              >
                {booking ? <Spinner /> : null} {booking ? "Reserving…" : slot ? `Book for ${prettySlot(slot)}` : "Pick a time"}
              </button>
            )}
            <p className="mt-3 text-center text-xs text-ink-muted">Instant confirmation · No payment now</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

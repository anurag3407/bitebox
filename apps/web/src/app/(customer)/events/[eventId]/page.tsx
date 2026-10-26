"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { DiningEventBookingDto } from "@startup/contracts";
import { useAuth } from "@/features/auth/auth-context";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageSpinner, SafeImage, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  DINING: "Chef's table",
  MUSIC: "Music",
  COMEDY: "Comedy",
  WORKSHOP: "Workshop",
};

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [booking, setBooking] = useState(false);
  const [lastBooking, setLastBooking] = useState<DiningEventBookingDto | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DiningEventBookingDto | null>(null);

  const eventQuery = useQuery({ queryKey: ["dining-event", eventId], queryFn: () => api.getDiningEvent(eventId) });
  const event = eventQuery.data;
  const bookingsQuery = useQuery({
    queryKey: ["dining-event-bookings"],
    queryFn: () => api.getDiningEventBookings(),
    enabled: auth.isLoaded && auth.isSignedIn,
  });
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api.getWallet(),
    enabled: auth.isLoaded && auth.isSignedIn,
  });

  const myBookings = useMemo(
    () => (bookingsQuery.data ?? []).filter((item) => item.eventId === eventId),
    [bookingsQuery.data, eventId]
  );
  const confirmed = myBookings.filter((item) => item.status === "CONFIRMED");
  const totalPaise = (event?.pricePaise ?? 0) * quantity;
  const balancePaise = wallet.data?.account.balancePaise ?? 0;
  const shortfall = Math.max(0, totalPaise - balancePaise);
  const soldOut = (event?.seatsLeft ?? 0) === 0;
  const past = event ? new Date(event.startsAt).getTime() < Date.now() : false;
  const canBook = !!event && !soldOut && !past && auth.isSignedIn;

  const bookTickets = async () => {
    if (!event) return;
    setBooking(true);
    try {
      const result = await api.bookDiningEvent(event.id, quantity);
      setLastBooking(result);
      setQuantity(1);
      queryClient.invalidateQueries({ queryKey: ["dining-event-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dining-event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      toast("Tickets booked. Your entry code is ready.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBooking(false);
    }
  };

  const cancelBooking = async () => {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelTarget(null);
    try {
      await api.cancelDiningEventBooking(target.id);
      queryClient.invalidateQueries({ queryKey: ["dining-event-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dining-event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      toast("Booking cancelled. Credits are back in your wallet.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (eventQuery.isLoading) return <PageSpinner />;
  if (eventQuery.isError || !event) {
    return (
      <div className="page py-16">
        <EmptyState
          icon={<Ticket />}
          title="This event isn't available"
          body="It may have ended or been taken off sale."
          action={<Link href="/events" className="btn btn-primary">Browse live events</Link>}
        />
      </div>
    );
  }

  return (
    <div className="page pb-20 pt-6">
      <Link href="/events" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
        <ArrowLeft className="h-4 w-4" /> All events
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-subtle">
            <SafeImage src={event.imageUrl} alt={event.title} className="h-full w-full object-cover" />
            <span className="absolute left-5 top-5 badge bg-white/95 text-ink">
              <Sparkles className="h-3 w-3" /> {CATEGORY_LABEL[event.category] ?? event.category}
            </span>
          </div>

          <p className="eyebrow mt-7">BiteBox Live · {event.restaurantName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{event.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDateTime(event.startsAt)}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {formatDateTime(event.endsAt)}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {event.venue}</span>
          </div>

          {event.description && <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{event.description}</p>}

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-subtle p-4">
              <p className="text-xs text-ink-muted">Tickets</p>
              <p className="mt-1 text-lg font-semibold text-ink tabular">{formatRupees(event.pricePaise)}</p>
              <p className="mt-0.5 text-xs text-ink-muted">per person, incl. taxes</p>
            </div>
            <div className="rounded-2xl bg-subtle p-4">
              <p className="text-xs text-ink-muted">Seats left</p>
              <p className="mt-1 text-lg font-semibold text-ink tabular">{event.seatsLeft} / {event.capacity}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{soldOut ? "Sold out" : "Small room, limited seats"}</p>
            </div>
            <div className="rounded-2xl bg-subtle p-4">
              <p className="text-xs text-ink-muted">At the venue</p>
              <Link href={`/restaurants/${event.restaurantSlug}`} className="mt-1 block text-lg font-semibold text-ink hover:underline">
                {event.restaurantName}
              </Link>
              <p className="mt-0.5 text-xs text-ink-muted">Show your ticket code at the door</p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-line p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <ShieldCheck className="h-4 w-4" /> Good to know
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>• Tickets are paid from BiteBox Credits and confirmed instantly.</li>
              <li>• Free cancellation up to 2 hours before the start time; credits return to your wallet.</li>
              <li>• Up to 6 seats per booking. The venue seats guests together under one booking code.</li>
              <li>• Please arrive 10 minutes early; the experience starts on time.</li>
            </ul>
          </div>

          {myBookings.length > 0 && (
            <section className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">Your tickets</h2>
                <span className="badge badge-neutral">{myBookings.length}</span>
              </div>
              <ul className="mt-4 space-y-4">
                {myBookings.map((item) => (
                  <li key={item.id} className={`overflow-hidden rounded-3xl border ${item.status === "CONFIRMED" ? "border-ink/20" : "border-line opacity-70"}`}>
                    <div className="flex items-center justify-between gap-4 bg-ink px-5 py-3 text-white">
                      <span className="text-xs uppercase tracking-wider text-white/60">{item.status === "CONFIRMED" ? "Entry pass" : "Cancelled"}</span>
                      <span className="font-mono text-sm tracking-[0.2em]">{item.bookingCode}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="text-sm font-medium text-ink">{item.eventTitle}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {formatDateTime(item.startsAt)} · {item.quantity} {item.quantity === 1 ? "ticket" : "tickets"} ·{" "}
                          {formatRupees(item.totalPaise)}
                        </p>
                      </div>
                      {item.canCancel && item.status === "CONFIRMED" && (
                        <button onClick={() => setCancelTarget(item)} className="btn btn-outline btn-sm text-danger">
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Book your seats</p>
                <p className="text-xs text-ink-muted">{soldOut ? "This event is sold out" : `${event.seatsLeft} seats available`}</p>
              </div>
              <Users className="h-4 w-4 text-ink-muted" />
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm text-ink-soft">Tickets</span>
              <div className="stepper h-10">
                <button aria-label="Fewer tickets" disabled={quantity <= 1} onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-7 text-center tabular">{quantity}</span>
                <button
                  aria-label="More tickets"
                  disabled={quantity >= 6 || quantity >= event.seatsLeft}
                  onClick={() => setQuantity(Math.min(6, event.seatsLeft, quantity + 1))}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">{quantity} × {formatRupees(event.pricePaise)}</span>
                <span className="font-semibold text-ink tabular">{formatRupees(totalPaise)}</span>
              </div>
              {auth.isSignedIn && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-ink-muted">Credits balance</span>
                  <span className={shortfall > 0 ? "text-danger tabular" : "text-success tabular"}>{formatRupees(balancePaise)}</span>
                </div>
              )}
            </div>

            {!auth.isLoaded ? (
              <div className="mt-5 flex justify-center py-2"><Spinner /></div>
            ) : !auth.isSignedIn ? (
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(`/events/${event.id}`)}`}
                className="btn btn-primary btn-lg btn-block mt-5"
              >
                Sign in to book
              </Link>
            ) : (
              <>
                <button
                  onClick={bookTickets}
                  disabled={!canBook || booking || shortfall > 0}
                  className="btn btn-primary btn-lg btn-block mt-5 justify-between"
                >
                  <span className="flex items-center gap-2">
                    {booking ? <Spinner /> : <Ticket className="h-4 w-4" />}
                    {soldOut ? "Sold out" : past ? "Event ended" : shortfall > 0 ? "Not enough credits" : booking ? "Booking…" : "Book tickets"}
                  </span>
                  {!soldOut && !past && shortfall === 0 && <span className="tabular">{formatRupees(totalPaise)}</span>}
                </button>
                {shortfall > 0 && (
                  <Link href="/account?tab=wallet" className="btn btn-outline btn-block mt-2">
                    Add {formatRupees(shortfall)} credits
                  </Link>
                )}
                <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-muted">
                  Paid with BiteBox Credits. Free cancellation until 2 hours before.
                </p>
              </>
            )}
          </div>

          {lastBooking && lastBooking.status === "CONFIRMED" && (
            <div className="mt-4 overflow-hidden rounded-3xl border border-success/30 bg-success-soft">
              <div className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-success">
                <Ticket className="h-4 w-4" /> You&apos;re in
              </div>
              <div className="border-t border-success/20 px-5 py-4">
                <p className="text-xs text-ink-muted">Show this code at the door</p>
                <p className="mt-1 font-mono text-xl tracking-[0.25em] text-ink">{lastBooking.bookingCode}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {lastBooking.quantity} {lastBooking.quantity === 1 ? "ticket" : "tickets"} · {formatDateTime(lastBooking.startsAt)}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel these tickets?"
        description="Credits go back to your wallet immediately and the seats are released for others."
        footer={
          <div className="flex gap-3">
            <button onClick={() => setCancelTarget(null)} className="btn btn-outline flex-1">Keep tickets</button>
            <button onClick={cancelBooking} className="btn btn-primary flex-1">Cancel booking</button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          {cancelTarget?.eventTitle} · {cancelTarget?.quantity} {cancelTarget?.quantity === 1 ? "ticket" : "tickets"} ·{" "}
          {cancelTarget ? formatRupees(cancelTarget.totalPaise) : ""}
        </p>
      </Modal>
    </div>
  );
}

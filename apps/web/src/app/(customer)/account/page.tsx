"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, ChevronRight, Heart, MapPin, Receipt, Star, Trash2, User } from "lucide-react";
import { AddressDto } from "@startup/contracts";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { AddressForm } from "@/components/location/address-form";
import { LocationSheet } from "@/components/location/location-sheet";
import { Modal } from "@/components/ui/modal";
import { EmptyState, SafeImage, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "@/features/pwa/push";
import { errorMessage, useApi, useMe } from "@/lib/api";
import { STATE_LABELS, formatDateTime, formatRupees } from "@/lib/format";

type Tab = "orders" | "addresses" | "favorites" | "profile";
const TABS: Array<{ id: Tab; label: string; icon: typeof User }> = [
  { id: "orders", label: "Orders", icon: Receipt },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "favorites", label: "Favourites", icon: Heart },
  { id: "profile", label: "Profile", icon: User },
];

function OrdersTab() {
  const api = useApi();
  const orders = useInfiniteQuery({
    queryKey: ["orders"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.getCustomerOrders({ before: pageParam, limit: 15 }),
    getNextPageParam: (last) => (last.length === 15 ? last[last.length - 1]!.createdAt : undefined),
  });
  const list = orders.data?.pages.flat() ?? [];

  if (orders.isPending) return <div className="h-40 bg-surface-muted rounded-2xl animate-pulse" />;
  if (list.length === 0) {
    return <EmptyState title="No orders yet" body="Your past orders will show up here." action={<Link href="/" className="inline-block px-4 py-2 bg-brand text-white text-xs font-bold rounded-xl">Order now</Link>} />;
  }
  return (
    <div className="space-y-3">
      {list.map((o) => (
        <Link key={o.orderId} href={`/orders/${o.orderId}`} className="flex gap-4 p-4 rounded-2xl border border-border hover:shadow-md transition-shadow">
          <SafeImage src={o.restaurantImageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm truncate">{o.restaurantName}</p>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  o.fulfillmentState === "DELIVERED" ? "bg-success-light text-success" : o.fulfillmentState === "CANCELLED" || o.fulfillmentState === "DELIVERY_FAILED" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                }`}
              >
                {STATE_LABELS[o.fulfillmentState]}
              </span>
            </div>
            <p className="text-xs text-text-secondary truncate mt-0.5">{o.itemsPreview}</p>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-text-secondary">{formatDateTime(o.createdAt)}</span>
              <span className="font-bold">
                {formatRupees(o.payablePaise)}
                {o.rating && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600">
                    {o.rating}
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  </span>
                )}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-text-secondary self-center" />
        </Link>
      ))}
      {orders.hasNextPage && (
        <button onClick={() => orders.fetchNextPage()} className="w-full py-2.5 rounded-xl border border-border text-sm font-bold">
          {orders.isFetchingNextPage ? "Loading…" : "Load older orders"}
        </button>
      )}
    </div>
  );
}

function AddressesTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => api.getAddresses() });
  const [editing, setEditing] = useState<AddressDto | null>(null);
  const [adding, setAdding] = useState(false);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      toast(ok, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setAdding(true)} className="w-full p-4 rounded-2xl border-2 border-dashed border-border text-sm font-bold text-brand">
        + Add new address
      </button>
      {addresses.data?.map((a) => (
        <div key={a.id} className="p-4 rounded-2xl border border-border">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold">
                {a.label} {a.isDefault && <span className="text-[10px] text-success bg-success-light px-1.5 py-0.5 rounded-full ml-1">DEFAULT</span>}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                {a.building}, {a.street}
              </p>
              {a.landmark && <p className="text-[11px] text-text-secondary">Near {a.landmark}</p>}
            </div>
            <button aria-label="Delete address" onClick={() => act(() => api.deleteAddress(a.id), "Address deleted")} className="p-2 text-text-secondary hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-4 mt-2 text-xs font-bold text-brand">
            <button onClick={() => setEditing(a)}>Edit</button>
            {!a.isDefault && <button onClick={() => act(() => api.setDefaultAddress(a.id), "Default address updated")}>Make default</button>}
          </div>
        </div>
      ))}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit address">
        {editing && (
          <AddressForm
            location={{ latitude: editing.latitude, longitude: editing.longitude }}
            initial={editing}
            onSaved={() => {
              setEditing(null);
              toast("Address updated", "success");
            }}
          />
        )}
      </Modal>
      <LocationSheet open={adding} onClose={() => setAdding(false)} requireSavedAddress />
    </div>
  );
}

function FavoritesTab() {
  const api = useApi();
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: () => api.getFavorites() });
  if (favorites.isPending) return <div className="h-40 bg-surface-muted rounded-2xl animate-pulse" />;
  if (!favorites.data?.length) return <EmptyState title="No favourites yet" body="Tap the heart on a restaurant to save it here." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {favorites.data.map((r) => (
        <RestaurantCard key={r.id} restaurant={r} />
      ))}
    </div>
  );
}

function ProfileTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const config = useQuery({ queryKey: ["config"], queryFn: () => fetch("/api/v1/config").then((r) => r.json()).then((j) => j.data) });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me.data) {
      setName(me.data.name);
      setPhone(me.data.phone?.replace(/^\+91/, "") ?? "");
    }
  }, [me.data]);
  useEffect(() => {
    getPushSubscription().then((s) => setPushOn(!!s)).catch(() => setPushOn(false));
  }, []);

  const vapid: string | null = config.data?.vapidPublicKey ?? null;

  return (
    <div className="space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.updateMe({ name: name.trim(), phone: phone ? `+91${phone}` : undefined });
            await queryClient.invalidateQueries({ queryKey: ["me"] });
            toast("Profile updated", "success");
          } catch (err) {
            toast(errorMessage(err), "error");
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-3"
      >
        <label className="block text-xs font-semibold text-text-secondary">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="mt-1 w-full p-3 bg-surface-muted border border-border rounded-xl text-sm" />
        </label>
        <label className="block text-xs font-semibold text-text-secondary">
          Mobile number
          <div className="flex mt-1">
            <span className="px-3 flex items-center bg-surface-muted border border-r-0 border-border rounded-l-xl text-sm">+91</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              pattern="[6-9][0-9]{9}"
              className="w-full p-3 bg-surface-muted border border-border rounded-r-xl text-sm"
            />
          </div>
        </label>
        <p className="text-xs text-text-secondary">Email: {me.data?.email ?? "—"}</p>
        <button disabled={busy} className="px-5 py-2.5 bg-brand text-white text-sm font-bold rounded-xl">
          Save profile
        </button>
      </form>

      <div className="p-4 rounded-2xl border border-border flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Order notifications</p>
          <p className="text-xs text-text-secondary">
            {!pushSupported()
              ? "Not supported in this browser. Install the app to your home screen to enable alerts."
              : !vapid
                ? "Notifications are not configured on this server."
                : "Get alerts when your order is accepted, picked up and delivered."}
          </p>
        </div>
        {pushSupported() && vapid && pushOn !== null && (
          <button
            onClick={async () => {
              try {
                if (pushOn) {
                  await disablePush(api);
                  setPushOn(false);
                } else {
                  const result = await enablePush(api, vapid);
                  if (result === "denied") toast("Notifications are blocked. Allow them in browser settings.", "error");
                  setPushOn(result === "enabled");
                }
              } catch (err) {
                toast(errorMessage(err), "error");
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${pushOn ? "border border-border" : "bg-brand text-white"}`}
          >
            {pushOn ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />} {pushOn ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
    </div>
  );
}

function AccountContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "orders") as Tab;

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <EmptyState
          title="Sign in to see your account"
          action={<Link href="/sign-in?redirect_url=/account" className="inline-block px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl">Sign in</Link>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-black">{me.data ? `Hi, ${me.data.name.split(" ")[0]}` : <Spinner />}</h1>
      <nav className="flex gap-2 overflow-x-auto mt-4 mb-6" aria-label="Account sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => router.replace(`/account?tab=${t.id}`)}
            aria-current={tab === t.id}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border ${tab === t.id ? "bg-brand text-white border-brand" : "border-border"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </nav>
      {tab === "orders" && <OrdersTab />}
      {tab === "addresses" && <AddressesTab />}
      {tab === "favorites" && <FavoritesTab />}
      {tab === "profile" && <ProfileTab />}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-10"><Spinner /></div>}>
      <AccountContent />
    </Suspense>
  );
}

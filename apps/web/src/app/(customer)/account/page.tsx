"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ChevronRight, Heart, Home, MapPin, Plus, Receipt, Star, User } from "lucide-react";
import { AddressDto } from "@startup/contracts";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { AddressForm } from "@/components/location/address-form";
import { LocationSheet } from "@/components/location/location-sheet";
import { ActionDialog, Modal } from "@/components/ui/modal";
import { Field, PhoneInput, Toggle } from "@/components/ui/field";
import { EmptyState, PageSpinner, SafeImage, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "@/features/pwa/push";
import { errorMessage, useApi, useMe } from "@/lib/api";
import { STATE_LABELS, formatDateTime, formatRupees } from "@/lib/format";

type Tab = "orders" | "addresses" | "favorites" | "profile";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "orders", label: "Orders" },
  { id: "addresses", label: "Addresses" },
  { id: "favorites", label: "Favourites" },
  { id: "profile", label: "Profile" },
];

function stateBadge(state: string): string {
  if (state === "DELIVERED") return "badge-neutral";
  if (state === "CANCELLED" || state === "DELIVERY_FAILED") return "badge-danger";
  return "badge-success";
}

function OrdersTab() {
  const api = useApi();
  const orders = useInfiniteQuery({
    queryKey: ["orders"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.getCustomerOrders({ before: pageParam, limit: 15 }),
    getNextPageParam: (last) => (last.length === 15 ? last[last.length - 1]!.createdAt : undefined),
  });
  const list = orders.data?.pages.flat() ?? [];

  if (orders.isPending) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<Receipt />}
        title="No orders yet"
        body="When you place an order, it'll show up here."
        action={
          <Link href="/" className="btn btn-primary">
            Find something to eat
          </Link>
        }
      />
    );
  }
  return (
    <div>
      <ul className="rows">
        {list.map((o) => (
          <li key={o.orderId}>
            <Link href={`/orders/${o.orderId}`} className="group flex items-center gap-5 py-5">
              <SafeImage src={o.restaurantImageUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="truncate font-medium text-ink">{o.restaurantName}</p>
                  <span className={`badge ${stateBadge(o.fulfillmentState)}`}>{STATE_LABELS[o.fulfillmentState]}</span>
                </div>
                <p className="mt-1 truncate text-sm text-ink-muted">{o.itemsPreview}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                  <span>{formatDateTime(o.createdAt)}</span>
                  <span>·</span>
                  <span className="text-ink tabular">{formatRupees(o.payablePaise)}</span>
                  {o.rating && (
                    <span className="inline-flex items-center gap-0.5 text-ink">
                      · <Star className="h-3 w-3 fill-ink" /> {o.rating}
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      {orders.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <button onClick={() => orders.fetchNextPage()} disabled={orders.isFetchingNextPage} className="btn btn-outline">
            {orders.isFetchingNextPage ? "Loading…" : "Load older orders"}
          </button>
        </div>
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
  const [deleting, setDeleting] = useState<AddressDto | null>(null);
  const [adding, setAdding] = useState(false);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      toast(ok, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
      throw err;
    }
  };

  if (addresses.isPending) return <div className="skeleton h-40" />;

  return (
    <div>
      <ul className="rows">
        {addresses.data?.map((a) => (
          <li key={a.id} className="flex items-start gap-5 py-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-soft">
              {a.label === "Work" ? <Briefcase className="h-4 w-4" /> : <Home className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-ink">
                {a.label} {a.isDefault && <span className="badge badge-neutral">Default</span>}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {a.building}, {a.street}
              </p>
              {a.landmark && <p className="text-sm text-ink-muted">Near {a.landmark}</p>}
              <div className="mt-3 flex gap-5 text-sm">
                <button onClick={() => setEditing(a)} className="link">
                  Edit
                </button>
                {!a.isDefault && (
                  <button onClick={() => act(() => api.setDefaultAddress(a.id), "Default address updated").catch(() => undefined)} className="link">
                    Make default
                  </button>
                )}
                <button onClick={() => setDeleting(a)} className="font-medium text-danger">
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {addresses.data?.length === 0 && <EmptyState icon={<MapPin />} title="No saved addresses" body="Save your home or office for faster checkout." />}
      <button onClick={() => setAdding(true)} className="btn btn-outline mt-4">
        <Plus className="h-4 w-4" /> Add address
      </button>

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
      <ActionDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        description={deleting ? `${deleting.label} · ${deleting.building}, ${deleting.street}` : undefined}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => act(() => api.deleteAddress(deleting!.id), "Address deleted")}
      />
      <LocationSheet open={adding} onClose={() => setAdding(false)} requireSavedAddress />
    </div>
  );
}

function FavoritesTab() {
  const api = useApi();
  const favorites = useQuery({ queryKey: ["favorites"], queryFn: () => api.getFavorites() });
  if (favorites.isPending) return <div className="skeleton h-40" />;
  if (!favorites.data?.length) return <EmptyState icon={<Heart />} title="No favourites yet" body="Tap the heart on any restaurant to keep it here." />;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.data.map((r) => (
        <RestaurantCard key={r.id} restaurant={r} />
      ))}
    </div>
  );
}

function SettingsBlock({ title, body, children }: { title: string; body?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 py-10 first:pt-0 md:grid-cols-[240px_1fr] md:gap-12">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {body && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
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
    getPushSubscription()
      .then((s) => setPushOn(!!s))
      .catch(() => setPushOn(false));
  }, []);

  const vapid: string | null = config.data?.vapidPublicKey ?? null;
  const dirty = !!me.data && (name.trim() !== me.data.name || phone !== (me.data.phone?.replace(/^\+91/, "") ?? ""));

  return (
    <div className="rows">
      <SettingsBlock title="Personal details" body="Used for your orders and receipts.">
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
          className="max-w-md space-y-5"
        >
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="input" autoComplete="name" />
          </Field>
          <Field label="Mobile number">
            <PhoneInput value={phone} onChange={setPhone} />
          </Field>
          <Field label="Email">
            <input value={me.data?.email ?? ""} disabled className="input" />
          </Field>
          <button disabled={busy || !dirty} className="btn btn-primary">
            {busy && <Spinner />} Save changes
          </button>
        </form>
      </SettingsBlock>

      <SettingsBlock
        title="Notifications"
        body={
          !pushSupported()
            ? "Not supported in this browser. Add BiteBox to your home screen to get alerts."
            : !vapid
              ? "Notifications aren't configured on this server."
              : "Alerts when your order is accepted, picked up and delivered."
        }
      >
        {pushSupported() && vapid && pushOn !== null && (
          <div className="flex max-w-md items-center justify-between gap-4">
            <span className="text-[15px] text-ink">Order updates</span>
            <Toggle
              label="Order update notifications"
              checked={pushOn}
              onChange={async () => {
                try {
                  if (pushOn) {
                    await disablePush(api);
                    setPushOn(false);
                  } else {
                    const result = await enablePush(api, vapid);
                    if (result === "denied") toast("Notifications are blocked. Allow them in your browser settings.", "error");
                    setPushOn(result === "enabled");
                  }
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
            />
          </div>
        )}
      </SettingsBlock>

      <PrivacyControls />
    </div>
  );
}

function PrivacyControls() {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    try {
      const res = await fetch("/api/v1/me/export", { headers: await api.authHeaders() });
      if (!res.ok) throw new Error("Could not prepare your data. Try again later.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoking synchronously can cancel the download in Safari and Firefox
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <SettingsBlock
      title="Your data"
      body={
        <>
          Download a copy, or permanently delete your account. Invoices are kept for tax purposes without your personal details.{" "}
          <Link href="/legal/privacy" className="link">
            Privacy policy
          </Link>
        </>
      }
    >
      <div className="flex flex-wrap gap-3">
        <button onClick={download} className="btn btn-outline">
          Download my data
        </button>
        <button
          onClick={() => {
            setTyped("");
            setConfirming(true);
          }}
          className="btn btn-danger-ghost"
        >
          Delete account
        </button>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Delete your account?"
        description="This can't be undone. Your saved addresses, favourites and profile are erased."
        footer={
          <button
            disabled={typed !== "DELETE" || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.deleteAccount();
                await signOut();
                queryClient.clear();
                router.push("/");
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setBusy(false);
              }
            }}
            className="btn btn-danger btn-block"
          >
            {busy && <Spinner />} Permanently delete
          </button>
        }
      >
        <Field label="Type DELETE to confirm">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input" autoComplete="off" />
        </Field>
      </Modal>
    </SettingsBlock>
  );
}

function AccountContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "orders") as Tab;

  if (!isLoaded) return <PageSpinner />;
  if (!isSignedIn) {
    return (
      <EmptyState
        icon={<User />}
        title="Sign in to see your account"
        body="Your orders, addresses and favourites live here."
        action={
          <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/account?tab=${tab}`)}`} className="btn btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="page pb-16 pt-10 sm:pt-14">
      <header>
        <h1 className="h-page">{me.data ? `Hi, ${me.data.name.split(" ")[0]}` : "Account"}</h1>
        {me.data?.email && <p className="mt-1.5 text-sm text-ink-muted">{me.data.email}</p>}
      </header>
      <div role="tablist" aria-label="Account sections" className="tabs mt-10">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => router.replace(`/account?tab=${t.id}`, { scroll: false })} className="tab">
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-10" role="tabpanel">
        {tab === "orders" && <OrdersTab />}
        {tab === "addresses" && <AddressesTab />}
        {tab === "favorites" && <FavoritesTab />}
        {tab === "profile" && <ProfileTab />}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AccountContent />
    </Suspense>
  );
}

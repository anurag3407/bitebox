"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bike, Briefcase, ChevronDown, Crown, Gift, GraduationCap, HandHeart, HelpCircle, Leaf, LogOut, MapPin, Receipt, Search, ShieldCheck, ShoppingBag, Soup, Store, Ticket, User, UtensilsCrossed, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LocationSheet } from "@/components/location/location-sheet";
import { useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { useApi, useMe } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useI18n } from "@/features/i18n/use-i18n";

export function Header() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const itemCount = useCartStore((s) => s.getItemCount());
  const label = useLocationStore((s) => s.label);
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const me = useMe();
  const api = useApi();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(6),
    enabled: isLoaded && isSignedIn,
    refetchInterval: 30_000,
  });

  const markNotifications = async (ids?: string[]) => {
    await api.markNotificationsRead(ids);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  useEffect(() => {
    if (!menuOpen && !notificationsOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setNotificationsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, notificationsOpen]);

  const role = me.data?.role;
  const portals = [
    role === "MERCHANT_STAFF" && { href: "/merchant", label: "Restaurant console", icon: Store },
    role === "RIDER" && { href: "/rider", label: "Delivery partner app", icon: Bike },
    role === "ADMIN" && { href: "/admin", label: "Operations", icon: ShieldCheck },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof Store }>;
  const initial = me.data?.name?.trim()?.[0]?.toUpperCase();
  const onSearchPage = pathname.startsWith("/search");

  const menuItem = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-soft hover:bg-subtle hover:text-ink";

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="page flex h-16 items-center gap-4 sm:h-[72px] sm:gap-6">
        <Link href="/" aria-label="BiteBox home" className="shrink-0">
          <Logo className="hidden sm:inline-flex" />
          <Logo compact className="sm:hidden" />
        </Link>

        <button
          onClick={() => setLocationOpen(true)}
          className="group flex min-w-0 items-center gap-2 rounded-full py-2 text-left"
          aria-label="Change delivery location"
        >
          <MapPin className="h-4 w-4 shrink-0 text-ink" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink sm:max-w-[240px]">{label ?? "Set delivery location"}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-y-0.5" />
        </button>

        <Link
          href="/dining"
          className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink md:inline-flex"
        >
          <UtensilsCrossed className="h-4 w-4" /> {t("nav.dineOut")}
        </Link>
        <Link
          href="/events"
          className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink lg:inline-flex"
        >
          <Ticket className="h-4 w-4" /> {t("nav.events")}
        </Link>
        <Link
          href="/meal-pass"
          className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink lg:inline-flex"
        >
          <Soup className="h-4 w-4" /> {t("nav.mealPasses")}
        </Link>
        <Link
          href="/surplus"
          className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink lg:inline-flex"
        >
          <Leaf className="h-4 w-4" /> {t("nav.rescue")}
        </Link>

        <div className="flex-1" />

        {!onSearchPage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            }}
            className="relative hidden w-full max-w-xs items-center lg:flex"
            role="search"
          >
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-ink-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              aria-label="Search"
              className="h-10 w-full rounded-full bg-subtle pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:bg-white focus:ring-1 focus:ring-line-strong"
            />
          </form>
        )}

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Account">
          <Link href="/search" aria-label="Search" className="btn btn-ghost btn-icon hidden sm:inline-flex lg:hidden">
            <Search className="h-5 w-5" />
          </Link>

          {isLoaded && isSignedIn && (
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setNotificationsOpen((o) => !o)}
                className="btn btn-ghost btn-icon relative"
                aria-label={`Notifications${notifications.data?.unreadCount ? `, ${notifications.data.unreadCount} unread` : ""}`}
                aria-haspopup="menu"
                aria-expanded={notificationsOpen}
              >
                <Bell className="h-5 w-5" />
                {(notifications.data?.unreadCount ?? 0) > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-white tabular">
                    {notifications.data!.unreadCount > 9 ? "9+" : notifications.data!.unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div role="menu" className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] animate-sheet-up overflow-hidden rounded-3xl border border-line bg-white shadow-pop">
                  <div className="flex items-center justify-between border-b border-line px-5 py-4">
                    <p className="text-sm font-semibold text-ink">Notifications</p>
                    {(notifications.data?.unreadCount ?? 0) > 0 && (
                      <button onClick={() => markNotifications()} className="text-xs font-medium text-ink-soft hover:text-ink">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[22rem] overflow-y-auto">
                    {notifications.isPending ? (
                      <div className="space-y-2 p-4">
                        <div className="skeleton h-14" />
                        <div className="skeleton h-14" />
                      </div>
                    ) : (notifications.data?.notifications.length ?? 0) === 0 ? (
                      <p className="px-5 py-10 text-center text-sm text-ink-muted">You&apos;re all caught up.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {notifications.data!.notifications.map((n) => (
                          <li key={n.id}>
                            <Link
                              href={n.url ?? "/notifications"}
                              onClick={() => {
                                setNotificationsOpen(false);
                                if (!n.readAt) void markNotifications([n.id]);
                              }}
                              className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-subtle"
                            >
                              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-line-strong" : "bg-accent"}`} />
                              <span className="min-w-0">
                                <span className={`block text-sm ${n.readAt ? "text-ink-soft" : "font-medium text-ink"}`}>{n.title}</span>
                                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-muted">{n.body}</span>
                                <span className="mt-1 block text-[10px] text-ink-muted">{timeAgo(n.createdAt)}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="block border-t border-line px-5 py-3 text-center text-xs font-medium text-ink-soft hover:bg-subtle hover:text-ink"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          )}

          {isLoaded && !isSignedIn ? (
            <Link href="/sign-in" className="btn btn-ghost btn-sm">
              Sign in
            </Link>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-ink transition-colors hover:bg-line"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                {initial ?? <User className="h-4 w-4" />}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-3 w-64 animate-sheet-up rounded-3xl border border-line bg-white p-2 shadow-pop">
                  {me.data && (
                    <div className="px-3 pb-3 pt-2">
                      <p className="truncate text-sm font-semibold text-ink">{me.data.name}</p>
                      {me.data.email && <p className="truncate text-xs text-ink-muted">{me.data.email}</p>}
                    </div>
                  )}
                  <Link role="menuitem" href="/account?tab=orders" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Receipt className="h-4 w-4" /> {t("account.orders")}
                  </Link>
                  <Link role="menuitem" href="/account?tab=wallet" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Wallet className="h-4 w-4" /> {t("account.credits")}
                  </Link>
                  <Link role="menuitem" href="/account?tab=gold" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Crown className="h-4 w-4" /> {t("account.gold")}
                  </Link>
                  <Link role="menuitem" href="/account?tab=rewards" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Gift className="h-4 w-4" /> {t("account.refer")}
                  </Link>
                  <Link role="menuitem" href="/gift-cards" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Gift className="h-4 w-4" /> {t("account.giftCards")}
                  </Link>
                  <Link role="menuitem" href="/donate" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <HandHeart className="h-4 w-4" /> {t("account.donate")}
                  </Link>
                  <Link role="menuitem" href="/account?tab=dining" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <UtensilsCrossed className="h-4 w-4" /> {t("account.diningBookings")}
                  </Link>
                  <Link role="menuitem" href="/events" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Ticket className="h-4 w-4" /> {t("account.events")}
                  </Link>
                  <Link role="menuitem" href="/meal-pass" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Soup className="h-4 w-4" /> {t("nav.mealPasses")}
                  </Link>
                  <Link role="menuitem" href="/campus" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <GraduationCap className="h-4 w-4" /> Campus meals
                  </Link>
                  <Link role="menuitem" href="/corporate" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Briefcase className="h-4 w-4" /> {t("account.corporate")}
                  </Link>
                  <Link role="menuitem" href="/surplus" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Leaf className="h-4 w-4" /> {t("nav.rescue")}
                  </Link>
                  <Link role="menuitem" href="/account?tab=profile" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <User className="h-4 w-4" /> {t("account.profile")}
                  </Link>
                  <Link role="menuitem" href="/support" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <HelpCircle className="h-4 w-4" /> {t("account.help")}
                  </Link>
                  {portals.length > 0 && <div className="my-2 border-t border-line" />}
                  {portals.map((p) => (
                    <Link role="menuitem" key={p.href} href={p.href} onClick={() => setMenuOpen(false)} className={`${menuItem} font-medium text-ink`}>
                      <p.icon className="h-4 w-4" /> {p.label}
                    </Link>
                  ))}
                  <div className="my-2 border-t border-line" />
                  <button
                    role="menuitem"
                    onClick={async () => {
                      setMenuOpen(false);
                      await signOut();
                      queryClient.clear();
                      router.push("/");
                    }}
                    className={`${menuItem} w-full`}
                  >
                    <LogOut className="h-4 w-4" /> {t("account.signOut")}
                  </button>
                </div>
              )}
            </div>
          )}

          <Link
            href="/cart"
            className={`btn btn-sm hidden sm:inline-flex ${itemCount > 0 ? "btn-primary" : "btn-secondary"}`}
            aria-label={itemCount > 0 ? `Cart, ${itemCount} items` : "Cart"}
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="tabular">{itemCount > 0 ? itemCount : "Cart"}</span>
          </Link>
        </nav>
      </div>
      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
    </header>
  );
}

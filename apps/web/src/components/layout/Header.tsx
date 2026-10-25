"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bike, ChevronDown, HelpCircle, LogOut, MapPin, Receipt, Search, ShieldCheck, ShoppingBag, Store, User } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LocationSheet } from "@/components/location/location-sheet";
import { useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { useMe } from "@/lib/api";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const itemCount = useCartStore((s) => s.getItemCount());
  const label = useLocationStore((s) => s.label);
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const me = useMe();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
              placeholder="Search dishes or restaurants"
              aria-label="Search"
              className="h-10 w-full rounded-full bg-subtle pl-10 pr-4 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:bg-white focus:ring-1 focus:ring-line-strong"
            />
          </form>
        )}

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Account">
          <Link href="/search" aria-label="Search" className="btn btn-ghost btn-icon hidden sm:inline-flex lg:hidden">
            <Search className="h-5 w-5" />
          </Link>

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
                    <Receipt className="h-4 w-4" /> Orders
                  </Link>
                  <Link role="menuitem" href="/account?tab=profile" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <User className="h-4 w-4" /> Account
                  </Link>
                  <Link role="menuitem" href="/support" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <HelpCircle className="h-4 w-4" /> Help
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
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          <Link
            href="/checkout"
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

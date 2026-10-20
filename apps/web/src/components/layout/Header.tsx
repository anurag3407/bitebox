"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Search, ShoppingCart, User, ChevronDown, Store, Bike, ShieldAlert, LogOut, Receipt, HelpCircle } from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { useMe } from "@/lib/api";
import { LocationSheet } from "@/components/location/location-sheet";
import { useQueryClient } from "@tanstack/react-query";

export function Header() {
  const router = useRouter();
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
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const role = me.data?.role;
  const portals = [
    role === "MERCHANT_STAFF" && { href: "/merchant", label: "Restaurant console", icon: Store },
    role === "RIDER" && { href: "/rider", label: "Delivery partner app", icon: Bike },
    role === "ADMIN" && { href: "/admin", label: "Operations", icon: ShieldAlert },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: typeof Store }>;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="ZomatoFresh home">
            <img src="/icons/icon-192.png" alt="" className="w-9 h-9 rounded-xl" />
            <span className="hidden sm:block text-xl font-black tracking-tight text-text-primary">
              Zomato<span className="text-brand">Fresh</span>
            </span>
          </Link>

          <button
            onClick={() => setLocationOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-surface-muted text-left text-xs min-w-0"
            aria-label="Change delivery location"
          >
            <MapPin className="w-4 h-4 text-brand shrink-0" />
            <span className="font-semibold text-text-primary truncate max-w-[140px] sm:max-w-[220px]">
              {label ?? "Set delivery location"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
          }}
          className="flex-1 max-w-md hidden md:flex items-center relative"
          role="search"
        >
          <Search className="w-4 h-4 text-text-secondary absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for restaurant, cuisine or a dish"
            aria-label="Search"
            className="w-full pl-10 pr-4 py-2 bg-surface-muted border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </form>

        <div className="flex items-center gap-2 shrink-0">
          {isLoaded && !isSignedIn ? (
            <Link href="/sign-in" className="px-3 py-2 text-xs font-bold text-text-primary hover:text-brand">
              Sign in
            </Link>
          ) : (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 p-2 rounded-full hover:bg-surface-muted"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <User className="w-5 h-5" />
                <span className="hidden lg:inline text-xs font-semibold max-w-[100px] truncate">{me.data?.name?.split(" ")[0]}</span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-border p-2 z-50">
                  <Link role="menuitem" href="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-muted">
                    <User className="w-4 h-4" /> Profile & addresses
                  </Link>
                  <Link role="menuitem" href="/account?tab=orders" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-muted">
                    <Receipt className="w-4 h-4" /> Your orders
                  </Link>
                  <Link role="menuitem" href="/support" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-muted">
                    <HelpCircle className="w-4 h-4" /> Help & support
                  </Link>
                  {portals.map((p) => (
                    <Link role="menuitem" key={p.href} href={p.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-muted font-semibold text-brand">
                      <p.icon className="w-4 h-4" /> {p.label}
                    </Link>
                  ))}
                  <button
                    role="menuitem"
                    onClick={async () => {
                      setMenuOpen(false);
                      await signOut();
                      queryClient.clear();
                      router.push("/");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-surface-muted text-text-secondary"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          <Link
            href="/checkout"
            className="relative hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-md"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Cart</span>
            {itemCount > 0 && <span className="ml-1 px-1.5 bg-white text-brand rounded-full text-[11px] font-black">{itemCount}</span>}
          </Link>
        </div>
      </div>
      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
    </header>
  );
}

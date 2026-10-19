"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Search,
  ShoppingCart,
  User,
  ChevronDown,
  Sparkles,
  Store,
  Bike,
  ShieldAlert,
} from "lucide-react";
import { useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { DEMO_USERS, useAuthStore } from "@/features/auth/auth-store";

export function Header() {
  const router = useRouter();
  const itemCount = useCartStore((s) => s.getItemCount());
  const { locationLabel } = useLocationStore();
  const { currentUser, setUser } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* 1. Brand Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform">
              Z
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-text-primary group-hover:text-brand transition-colors">
                Zomato<span className="text-brand">Fresh</span>
              </span>
              <span className="text-[10px] text-text-secondary font-medium tracking-wide uppercase -mt-1">
                25 Min Delivery
              </span>
            </div>
          </Link>

          {/* 2. Delivery Location Selector */}
          <button
            onClick={() => {
              const newLoc = prompt(
                "Enter delivery area (e.g. Connaught Place, South Extension, Noida Sector 18):",
                locationLabel
              );
              if (newLoc) {
                useLocationStore.getState().setLocation(
                  { latitude: 28.6315, longitude: 77.2167 },
                  newLoc
                );
              }
            }}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-surface-muted text-left border border-transparent hover:border-border transition-colors text-xs"
            title="Click to change delivery address"
          >
            <MapPin className="w-4 h-4 text-brand shrink-0" />
            <div className="max-w-[180px] truncate">
              <span className="font-semibold text-text-primary block truncate">
                {locationLabel}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
          </button>
        </div>

        {/* 3. Global Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex-1 max-w-md hidden sm:flex items-center relative"
        >
          <Search className="w-4 h-4 text-text-secondary absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for restaurant, cuisine, or a dish..."
            className="w-full pl-10 pr-4 py-2 bg-surface-muted border border-border rounded-full text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
          />
        </form>

        {/* 4. Action Controls & Multi-Actor Switcher */}
        <div className="flex items-center gap-3">
          {/* Actor / Demo User Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:border-text-secondary bg-surface-muted text-xs font-medium text-text-primary transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>{currentUser.name.split(" ")[0]}</span>
              <span className="text-[10px] text-text-secondary uppercase px-1 bg-white rounded border border-border">
                {currentUser.role}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-border p-2 z-50">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                    Switch Actor Perspective
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Experience all marketplace portals
                  </p>
                </div>

                <button
                  onClick={() => {
                    setUser("customer");
                    setIsUserMenuOpen(false);
                    router.push("/");
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                    currentUser.role === "CUSTOMER"
                      ? "bg-brand-light text-brand font-bold"
                      : "hover:bg-surface-muted text-text-primary"
                  }`}
                >
                  <User className="w-4 h-4" />
                  <div>
                    <p className="font-semibold">Customer</p>
                    <p className="text-[10px] text-text-secondary">Rahul Sharma (Order food)</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setUser("merchant");
                    setIsUserMenuOpen(false);
                    router.push("/merchant");
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                    currentUser.role === "MERCHANT_STAFF"
                      ? "bg-brand-light text-brand font-bold"
                      : "hover:bg-surface-muted text-text-primary"
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <div>
                    <p className="font-semibold">Restaurant Partner</p>
                    <p className="text-[10px] text-text-secondary">Vikram Anand (Accept orders)</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setUser("rider");
                    setIsUserMenuOpen(false);
                    router.push("/rider");
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                    currentUser.role === "RIDER"
                      ? "bg-brand-light text-brand font-bold"
                      : "hover:bg-surface-muted text-text-primary"
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <div>
                    <p className="font-semibold">Delivery Partner</p>
                    <p className="text-[10px] text-text-secondary">Amit Kumar (Pickup & Deliver)</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setUser("admin");
                    setIsUserMenuOpen(false);
                    router.push("/admin");
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                    currentUser.role === "ADMIN"
                      ? "bg-brand-light text-brand font-bold"
                      : "hover:bg-surface-muted text-text-primary"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <div>
                    <p className="font-semibold">Operations / Admin</p>
                    <p className="text-[10px] text-text-secondary">Siddharth (Refunds & Jobs)</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Account link */}
          <Link
            href="/account"
            className="p-2 rounded-full hover:bg-surface-muted text-text-primary transition-colors"
            title="My Account & Orders"
          >
            <User className="w-5 h-5" />
          </Link>

          {/* Cart Trigger */}
          <Link
            href="/checkout"
            className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-md hover:shadow-lg transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-white text-brand rounded-full text-[11px] font-black">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

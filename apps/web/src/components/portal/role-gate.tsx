"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-context";
import { useMe } from "@/lib/api";
import { Spinner } from "@/components/ui/misc";

/** Client-side convenience gate; the API enforces the same roles server-side. */
export function RoleGate({ roles, title, children }: { roles: string[]; title: string; children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();

  if (!isLoaded || (isSignedIn && me.isPending)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spinner className="w-6 h-6 text-brand" />
      </div>
    );
  }
  if (!isSignedIn || !me.data || !roles.includes(me.data.role)) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center rounded-3xl border border-border bg-surface-muted">
        <h1 className="text-xl font-black">{title}</h1>
        <p className="text-sm text-text-secondary mt-2">
          {isSignedIn ? "Your account does not have access to this area." : "Sign in with an authorised account to continue."}
        </p>
        <Link href={`/sign-in?redirect_url=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`} className="inline-block mt-5 px-5 py-2.5 bg-brand text-white text-sm font-bold rounded-xl">
          {isSignedIn ? "Switch account" : "Sign in"}
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

export function PortalHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-text-primary text-white pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 font-black">
          <img src="/icons/icon-192.png" alt="" className="w-7 h-7 rounded-lg" />
          <span className="text-sm sm:text-base">{title}</span>
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

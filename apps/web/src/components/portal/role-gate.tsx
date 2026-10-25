"use client";

import React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { useMe } from "@/lib/api";
import { LogoMark } from "@/components/brand/logo";
import { EmptyState, PageSpinner } from "@/components/ui/misc";

/** Client-side convenience gate; the API enforces the same roles server-side. */
export function RoleGate({ roles, title, children }: { roles: string[]; title: string; children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();

  if (!isLoaded || (isSignedIn && me.isPending)) return <PageSpinner />;
  if (!isSignedIn || !me.data || !roles.includes(me.data.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <EmptyState
          icon={<Lock />}
          title={title}
          body={isSignedIn ? "Your account doesn't have access to this area." : "Sign in with an authorised account to continue."}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/" className="btn btn-secondary">
                Go home
              </Link>
              <Link href={`/sign-in?redirect_url=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`} className="btn btn-primary">
                {isSignedIn ? "Switch account" : "Sign in"}
              </Link>
            </div>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

export function PortalHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="BiteBox home">
          <LogoMark className="h-7 w-7 shrink-0" />
          <span className="h-5 w-px bg-line" aria-hidden />
          <span className="truncate text-[15px] font-medium text-ink">{title}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

/** Standard content width for portal pages. */
export function PortalBody({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto w-full px-5 pb-16 pt-8 sm:px-8 sm:pt-10 ${narrow ? "max-w-xl" : "max-w-7xl"}`}>{children}</div>;
}

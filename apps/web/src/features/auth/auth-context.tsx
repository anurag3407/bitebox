"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/nextjs";
import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "./clerk-config";
import { useDemoAuthStore } from "./demo-auth-store";

export interface AuthApi {
  mode: "clerk" | "demo";
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const clerk = useClerkAuth();
  const getToken = useCallback(() => clerk.getToken(), [clerk]);
  const value = useMemo<AuthApi>(
    () => ({
      mode: "clerk",
      isLoaded: clerk.isLoaded,
      isSignedIn: !!clerk.isSignedIn,
      getToken,
      signOut: async () => {
        await clerk.signOut();
      },
    }),
    [clerk, getToken]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function DemoBridge({ children }: { children: React.ReactNode }) {
  const persona = useDemoAuthStore((s) => s.persona);
  const signOut = useDemoAuthStore((s) => s.signOut);
  // Persisted state is only available after hydration; avoid flashing "signed out"
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const value = useMemo<AuthApi>(
    () => ({
      mode: "demo",
      isLoaded: hydrated,
      isSignedIn: !!persona,
      getToken: async () => useDemoAuthStore.getState().persona?.token ?? null,
      signOut: async () => signOut(),
    }),
    [hydrated, persona, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (CLERK_ENABLED) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} signInUrl="/sign-in" signUpUrl="/sign-up">
        <ClerkBridge>{children}</ClerkBridge>
      </ClerkProvider>
    );
  }
  return <DemoBridge>{children}</DemoBridge>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

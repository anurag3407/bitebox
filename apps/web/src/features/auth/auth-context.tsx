"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  // Clerk returns fresh function identities on every render. Everything downstream
  // (ApiClient, the live-tracking stream, effects keyed on `api`) needs a stable
  // getter, otherwise each render tears down and reopens connections.
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;
  const getToken = useCallback(() => clerkRef.current.getToken(), []);
  const signOut = useCallback(async () => {
    await clerkRef.current.signOut();
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ mode: "clerk", isLoaded: clerk.isLoaded, isSignedIn: !!clerk.isSignedIn, getToken, signOut }),
    [clerk.isLoaded, clerk.isSignedIn, getToken, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const demoGetToken = async () => useDemoAuthStore.getState().persona?.token ?? null;
const demoSignOut = async () => useDemoAuthStore.getState().signOut();

function DemoBridge({ children }: { children: React.ReactNode }) {
  const persona = useDemoAuthStore((s) => s.persona);
  // The persona is persisted; load it after mount so SSR and the first client render agree
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void Promise.resolve(useDemoAuthStore.persist.rehydrate()).then(() => setHydrated(true));
  }, []);

  const value = useMemo<AuthApi>(
    () => ({ mode: "demo", isLoaded: hydrated, isSignedIn: hydrated && !!persona, getToken: demoGetToken, signOut: demoSignOut }),
    [hydrated, persona]
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

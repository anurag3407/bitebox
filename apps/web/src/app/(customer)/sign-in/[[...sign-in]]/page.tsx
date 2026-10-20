"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import { CLERK_ENABLED } from "@/features/auth/clerk-config";
import { DEMO_PERSONAS, useDemoAuthStore } from "@/features/auth/demo-auth-store";
import { useQueryClient } from "@tanstack/react-query";

function safeRedirect(target: string | null): string | null {
  // Only same-site paths: never bounce users to an attacker-supplied absolute URL
  return target && target.startsWith("/") && !target.startsWith("//") ? target : null;
}

function DemoSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const signIn = useDemoAuthStore((s) => s.signIn);
  const queryClient = useQueryClient();
  const redirect = safeRedirect(params.get("redirect_url"));

  return (
    <div className="max-w-md mx-auto my-12 px-4">
      <div className="bg-white rounded-3xl border border-border p-8 shadow-xl space-y-6">
        <div className="text-center">
          <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-2xl mx-auto mb-3" />
          <h1 className="text-2xl font-black">Sign in</h1>
        </div>
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Development mode: Clerk is not configured, so you can sign in as a demo persona. Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
            <code>CLERK_ISSUER</code> for real accounts. The server rejects demo personas in staging and production.
          </span>
        </div>
        <ul className="space-y-3">
          {DEMO_PERSONAS.map((p) => (
            <li key={p.key}>
              <button
                onClick={() => {
                  signIn(p.key);
                  queryClient.clear();
                  router.push(redirect ?? p.home);
                }}
                className="w-full p-4 rounded-2xl border border-border hover:border-brand text-left"
              >
                <p className="font-bold text-sm">{p.name}</p>
                <p className="text-xs text-text-secondary">{p.role.replace("_", " ").toLowerCase()}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ClerkSignIn() {
  const params = useSearchParams();
  return (
    <div className="flex justify-center my-12 px-4">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl={safeRedirect(params.get("redirect_url")) ?? "/"} />
    </div>
  );
}

export default function SignInPage() {
  return <Suspense>{CLERK_ENABLED ? <ClerkSignIn /> : <DemoSignIn />}</Suspense>;
}

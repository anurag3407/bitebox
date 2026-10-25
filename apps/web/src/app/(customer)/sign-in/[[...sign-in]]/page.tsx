"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { LogoMark } from "@/components/brand/logo";
import { CLERK_ENABLED } from "@/features/auth/clerk-config";
import { DEMO_PERSONAS, useDemoAuthStore } from "@/features/auth/demo-auth-store";

function safeRedirect(target: string | null): string | null {
  // Only same-site paths: never bounce users to an attacker-supplied absolute URL
  return target && target.startsWith("/") && !target.startsWith("//") ? target : null;
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Customer",
  MERCHANT_STAFF: "Restaurant staff",
  RIDER: "Delivery partner",
  ADMIN: "Operations admin",
};

function DemoSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const signIn = useDemoAuthStore((s) => s.signIn);
  const queryClient = useQueryClient();
  const redirect = safeRedirect(params.get("redirect_url"));

  return (
    <div className="mx-auto w-full max-w-md px-5 py-16 sm:py-24">
      <LogoMark className="h-10 w-10" />
      <h1 className="h-page mt-8">Welcome to BiteBox</h1>
      <p className="mt-2 text-[15px] text-ink-muted">Choose an account to continue.</p>

      <ul className="mt-10 space-y-2">
        {DEMO_PERSONAS.map((p) => (
          <li key={p.key}>
            <button
              onClick={() => {
                signIn(p.key);
                queryClient.clear();
                router.push(redirect ?? p.home);
              }}
              className="group flex w-full items-center gap-4 rounded-3xl border border-line p-4 text-left transition-colors hover:border-ink"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-ink">
                {p.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{p.name}</span>
                <span className="block text-sm text-ink-muted">{ROLE_LABEL[p.role] ?? p.role}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>

      <p className="notice notice-neutral mt-10 text-xs">
        Development mode: Clerk isn&apos;t configured, so you can sign in as a demo persona. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_ISSUER for real accounts. The
        server rejects demo personas in staging and production.
      </p>
    </div>
  );
}

function ClerkSignIn() {
  const params = useSearchParams();
  return (
    <div className="flex justify-center px-5 py-16">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl={safeRedirect(params.get("redirect_url")) ?? "/"} />
    </div>
  );
}

export default function SignInPage() {
  return <Suspense>{CLERK_ENABLED ? <ClerkSignIn /> : <DemoSignIn />}</Suspense>;
}

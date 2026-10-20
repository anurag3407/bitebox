"use client";

import React from "react";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/features/auth/clerk-config";

export default function SignUpPage() {
  if (!CLERK_ENABLED) {
    return (
      <div className="max-w-md mx-auto my-16 px-4 text-center">
        <p className="text-sm text-text-secondary">Sign-up needs Clerk to be configured.</p>
        <Link href="/sign-in" className="inline-block mt-4 px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl">
          Use a demo account
        </Link>
      </div>
    );
  }
  return (
    <div className="flex justify-center my-12 px-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
    </div>
  );
}

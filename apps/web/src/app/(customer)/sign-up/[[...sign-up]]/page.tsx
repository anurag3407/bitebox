"use client";

import React from "react";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { CLERK_ENABLED } from "@/features/auth/clerk-config";

export default function SignUpPage() {
  if (!CLERK_ENABLED) {
    return (
      <EmptyState
        icon={<UserPlus />}
        title="Sign-up needs Clerk"
        body="This server runs without an identity provider. Use a demo account instead."
        action={
          <Link href="/sign-in" className="btn btn-primary">
            Use a demo account
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex justify-center px-5 py-16">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
    </div>
  );
}

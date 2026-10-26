"use client";

import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/api";

const KEY = "bitebox_referral";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Captures ?ref= links and applies the code once the visitor signs in. */
export function ReferralCapture() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const toast = useToast();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (!code) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
    } catch {
      // Private mode / storage disabled
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let saved: { code: string; at: number } | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    if (!saved?.code || Date.now() - saved.at > MAX_AGE_MS) return;
    localStorage.removeItem(KEY);
    api
      .applyReferralCode(saved.code)
      .then(() => {
        toast(`Referral ${saved!.code} applied. Credits unlock after your first delivery.`, "success");
      })
      .catch(() => {
        // Already referred or ordered before — nothing to do
      });
  }, [isLoaded, isSignedIn, api, toast]);

  return null;
}

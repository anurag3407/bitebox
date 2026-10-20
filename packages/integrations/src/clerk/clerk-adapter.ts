import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { UserRole } from "@startup/contracts";
import { getServerEnv, isDemoAuthEnabled } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

/**
 * Identity proven by the request. Deliberately carries no role: authorization is
 * decided from the database (app_users.role, memberships), never from the token.
 */
export interface VerifiedIdentity {
  clerkUserId: string;
  sessionId?: string;
  isDemo: boolean;
  // Only set for demo personas, which map onto seeded users
  demoProfile?: { name: string; email: string; role: UserRole };
}

/** @deprecated kept for older call sites; prefer VerifiedIdentity + DB role lookup. */
export interface AuthenticatedActor {
  clerkUserId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface ClerkUserProfile {
  email: string | null;
  name: string | null;
  phone: string | null;
}

const DEMO_PERSONAS: Record<string, { clerkUserId: string; name: string; email: string; role: UserRole }> = {
  demo_customer: { clerkUserId: "user_clerk_customer", name: "Rahul Sharma", email: "customer@example.com", role: UserRole.CUSTOMER },
  demo_merchant: { clerkUserId: "user_clerk_merchant", name: "Chef Vikram Anand", email: "merchant@example.com", role: UserRole.MERCHANT_STAFF },
  demo_rider: { clerkUserId: "user_clerk_rider", name: "Amit Kumar", email: "rider@example.com", role: UserRole.RIDER },
  demo_admin: { clerkUserId: "user_clerk_admin", name: "Siddharth Operations", email: "admin@example.com", role: UserRole.ADMIN },
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrlInUse: string | null = null;

function getJwks(url: string) {
  if (!jwks || jwksUrlInUse !== url) {
    // jose caches keys and refetches on unknown `kid` (key rotation) with a cooldown
    jwks = createRemoteJWKSet(new URL(url), { timeoutDuration: 3000, cooldownDuration: 30_000 });
    jwksUrlInUse = url;
  }
  return jwks;
}

export function extractBearerToken(authHeader?: string | null, cookieHeader?: string | null): string | null {
  const fromHeader = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (fromHeader) return fromHeader;
  // Clerk sets a same-origin `__session` cookie holding the session JWT
  const match = cookieHeader?.match(/(?:^|;\s*)__session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export class ClerkAuthAdapter {
  /**
   * Verifies a Clerk session token (RS256 JWT) against the instance JWKS and returns
   * the subject. Returns null for anything unverifiable; never throws on bad input.
   */
  static async verifyToken(token: string): Promise<VerifiedIdentity | null> {
    if (!token) return null;

    if (token.startsWith("demo_")) {
      const persona = DEMO_PERSONAS[token];
      if (!persona || !isDemoAuthEnabled()) return null;
      return {
        clerkUserId: persona.clerkUserId,
        isDemo: true,
        demoProfile: { name: persona.name, email: persona.email, role: persona.role },
      };
    }

    const env = getServerEnv();
    if (!env.CLERK_ISSUER) {
      // Without an issuer we cannot verify anything; refuse rather than trust the token
      return null;
    }

    try {
      const issuer = env.CLERK_ISSUER.replace(/\/$/, "");
      const { payload } = await jwtVerify(token, getJwks(env.CLERK_JWKS_URL ?? `${issuer}/.well-known/jwks.json`), {
        issuer,
        algorithms: ["RS256"],
        clockTolerance: 5,
      });
      if (!payload.sub) return null;
      if (!ClerkAuthAdapter.isAuthorizedParty(payload, env.CLERK_AUTHORIZED_PARTIES, env.APP_ORIGIN)) return null;
      return { clerkUserId: payload.sub, sessionId: typeof payload.sid === "string" ? payload.sid : undefined, isDemo: false };
    } catch {
      return null;
    }
  }

  /** `azp` protects against tokens minted for another of our origins (CSRF-like replay). */
  static isAuthorizedParty(payload: JWTPayload, configured: string[], appOrigin: string): boolean {
    const azp = payload.azp;
    if (typeof azp !== "string") return true; // native/mobile tokens may omit azp
    const allowed = configured.length > 0 ? configured : [appOrigin];
    return allowed.some((origin) => origin.replace(/\/$/, "") === azp.replace(/\/$/, ""));
  }

  static async resolveIdentity(authHeader?: string | null, cookieHeader?: string | null): Promise<VerifiedIdentity | null> {
    const token = extractBearerToken(authHeader, cookieHeader);
    return token ? ClerkAuthAdapter.verifyToken(token) : null;
  }

  /**
   * Back-compat shim used by older tests: resolves demo personas with their role.
   * Real tokens resolve to a CUSTOMER placeholder only after verification succeeds.
   */
  static async resolveActor(authHeader?: string | null): Promise<AuthenticatedActor | null> {
    const identity = await ClerkAuthAdapter.resolveIdentity(authHeader);
    if (!identity) return null;
    if (identity.demoProfile) {
      return { clerkUserId: identity.clerkUserId, ...identity.demoProfile };
    }
    return { clerkUserId: identity.clerkUserId, email: "", name: "", role: UserRole.CUSTOMER };
  }

  /** Reads profile fields from the Clerk Backend API (used once, when a user is first seen). */
  static async fetchUserProfile(clerkUserId: string): Promise<ClerkUserProfile | null> {
    const env = getServerEnv();
    if (!env.CLERK_SECRET_KEY || env.CLERK_SECRET_KEY.startsWith("sk_test_dev")) return null;
    try {
      const res = await fetchWithTimeout(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`, {
        headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
        timeoutMs: 3000,
      });
      if (!res.ok) return null;
      const user = (await res.json()) as {
        first_name?: string | null;
        last_name?: string | null;
        primary_email_address_id?: string | null;
        email_addresses?: Array<{ id: string; email_address: string }>;
        primary_phone_number_id?: string | null;
        phone_numbers?: Array<{ id: string; phone_number: string }>;
      };
      const email =
        user.email_addresses?.find((e) => e.id === user.primary_email_address_id)?.email_address ??
        user.email_addresses?.[0]?.email_address ??
        null;
      const phone =
        user.phone_numbers?.find((p) => p.id === user.primary_phone_number_id)?.phone_number ??
        user.phone_numbers?.[0]?.phone_number ??
        null;
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || null;
      return { email, name, phone };
    } catch {
      return null;
    }
  }
}

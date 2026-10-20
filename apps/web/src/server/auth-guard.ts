import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { AppUser, RestaurantRepository, RiderRepository, UserRepository } from "@startup/database";
import { ClerkAuthAdapter, VerifiedIdentity } from "@startup/integrations";

export interface AuthContext {
  identity: VerifiedIdentity;
  user: AppUser;
  role: UserRole;
}

/**
 * Resolves the caller from a verified Clerk session (Authorization header or the
 * `__session` cookie). The role always comes from our database, never from the token.
 */
export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const identity = await ClerkAuthAdapter.resolveIdentity(req.headers.get("authorization"), req.headers.get("cookie"));
  if (!identity) return null;

  let user = await UserRepository.findByClerkId(identity.clerkUserId);
  if (!user) {
    const profile = identity.demoProfile ?? (await ClerkAuthAdapter.fetchUserProfile(identity.clerkUserId));
    user = await UserRepository.upsertFromIdentity({
      clerkUserId: identity.clerkUserId,
      email: profile?.email,
      name: profile?.name,
      phone: "phone" in (profile ?? {}) ? (profile as { phone: string | null }).phone : null,
      // Demo personas map onto seeded users; real sign-ups always start as customers
      role: identity.demoProfile?.role ?? UserRole.CUSTOMER,
    });
  }
  return { identity, user, role: user.role as UserRole };
}

/** Requires an authenticated, active user, optionally with one of `roles`. */
export async function requireAuth(req: NextRequest, roles?: UserRole[]): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new DomainError("UNAUTHENTICATED", "Please sign in to continue.");
  if (!ctx.user.isActive) throw new DomainError("FORBIDDEN", "This account has been disabled. Contact support.");
  if (roles && !roles.includes(ctx.role)) {
    throw new DomainError("FORBIDDEN", "You do not have access to this resource.");
  }
  return ctx;
}

/** Merchant staff may only act on restaurants they are a member of; admins on all. */
export async function requireRestaurantAccess(ctx: AuthContext, restaurantId: string): Promise<void> {
  if (ctx.role === UserRole.ADMIN) return;
  if (ctx.role !== UserRole.MERCHANT_STAFF) throw new DomainError("FORBIDDEN", "Restaurant staff access required.");
  const membership = await RestaurantRepository.getMembership(ctx.user.id, restaurantId);
  if (!membership) throw new DomainError("FORBIDDEN", "You are not a member of this restaurant.");
}

export async function requireRiderProfile(ctx: AuthContext) {
  if (ctx.role !== UserRole.RIDER) throw new DomainError("FORBIDDEN", "Delivery partner access required.");
  const rider = await RiderRepository.findByUserId(ctx.user.id);
  if (!rider) throw new DomainError("NOT_FOUND", "Delivery partner profile not found.");
  return rider;
}

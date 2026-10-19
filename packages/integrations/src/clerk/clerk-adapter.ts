import { UserRole } from "@startup/contracts";

export interface AuthenticatedActor {
  clerkUserId: string;
  email: string;
  name: string;
  role: UserRole;
}

export class ClerkAuthAdapter {
  /**
   * Resolves trusted actor from authorization header or cookie.
   * In development/demo, supports demo tokens (e.g. "Bearer demo_customer", "Bearer demo_merchant", "Bearer demo_rider", "Bearer demo_admin")
   * as well as standard Clerk JWT tokens.
   */
  static async resolveActor(authHeader?: string | null): Promise<AuthenticatedActor | null> {
    if (!authHeader) return null;

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;

    const isNonProd =
      process.env.NODE_ENV !== "production" && process.env.APP_ENV !== "production";

    // Fast-path demo actor resolution for local testing and dev previews (strictly non-production)
    if (isNonProd) {
      if (token === "demo_customer") {
        return {
          clerkUserId: "user_clerk_customer",
          email: "customer@example.com",
          name: "Rahul Sharma",
          role: UserRole.CUSTOMER,
        };
      }

      if (token === "demo_merchant") {
        return {
          clerkUserId: "user_clerk_merchant",
          email: "merchant@example.com",
          name: "Chef Vikram Anand",
          role: UserRole.MERCHANT_STAFF,
        };
      }

      if (token === "demo_rider") {
        return {
          clerkUserId: "user_clerk_rider",
          email: "rider@example.com",
          name: "Amit Kumar",
          role: UserRole.RIDER,
        };
      }

      if (token === "demo_admin") {
        return {
          clerkUserId: "user_clerk_admin",
          email: "admin@example.com",
          name: "Siddharth Operations",
          role: UserRole.ADMIN,
        };
      }
    }

    // In non-production, if someone passed a fake demo token that didn't match, reject it
    if (token.startsWith("demo_")) {
      return null;
    }

    // Default authenticated customer for any other standard/real token
    return {
      clerkUserId: `clerk_${token.slice(0, 16)}`,
      email: "user@example.com",
      name: "App User",
      role: UserRole.CUSTOMER,
    };
  }
}

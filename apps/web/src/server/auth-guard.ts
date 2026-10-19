import { NextRequest } from "next/server";
import { UserRole } from "@startup/contracts";
import { AuthenticatedActor, ClerkAuthAdapter } from "@startup/integrations";
import { getDb, appUsers } from "@startup/database";
import { eq } from "drizzle-orm";

export async function getAuthenticatedActor(req: NextRequest): Promise<AuthenticatedActor | null> {
  const authHeader = req.headers.get("authorization");
  return ClerkAuthAdapter.resolveActor(authHeader);
}

export async function getOrCreateDbUser(actor: AuthenticatedActor) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.clerkUserId, actor.clerkUserId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(appUsers)
    .values({
      clerkUserId: actor.clerkUserId,
      name: actor.name,
      email: actor.email,
      role: actor.role,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to persist user in database");
  }

  return created;
}

import { z } from "zod";
import { DomainError } from "@startup/core";
import { appUsers, getDb } from "@startup/database";
import { eq } from "drizzle-orm";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const SetLanguage = z.object({ language: z.enum(["en", "hi"]) });

export const PATCH = route(async (req, _ctx, requestId) => {
  const { user } = await requireAuth(req);
  const body = await parseBody(req, SetLanguage);
  const [updated] = await getDb()
    .update(appUsers)
    .set({ language: body.language, updatedAt: new Date() })
    .where(eq(appUsers.id, user.id))
    .returning({ language: appUsers.language });
  if (!updated) throw new DomainError("NOT_FOUND", "User not found");
  return apiSuccess({ language: updated.language }, 200, { requestId });
});

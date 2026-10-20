import { PrivacyRepository } from "@startup/database";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { route } from "@/server/route";

/** Downloadable copy of the caller's personal data (DPDP right to access). */
export const GET = route(async (req) => {
  const { user } = await requireAuth(req);
  await enforceRateLimit(req, "partnerApplication", `export:${user.id}`);
  const data = await PrivacyRepository.exportUserData(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

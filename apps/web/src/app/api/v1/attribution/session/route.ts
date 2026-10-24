import { z } from "zod";
import { DomainError, verifyAttributionToken } from "@startup/core";
import { AttributionRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { getAuthContext } from "@/server/auth-guard";
import { parseBody, route } from "@/server/route";

const SessionRequest = z.object({
  token: z.string().min(10),
  slug: z.string().min(1).max(200),
  sourceType: z.enum(["QR_SCAN", "WHATSAPP_LINK", "STOREFRONT_SLUG"]).optional(),
});

export const POST = route(async (req, _ctx, requestId) => {
  const { token, slug, sourceType } = await parseBody(req, SessionRequest);
  const link = await AttributionRepository.findLinkBySlug(slug);
  if (!link) throw new DomainError("NOT_FOUND", "Storefront link not found");
  const payload = verifyAttributionToken(token, link.hmacSecret);
  if (!payload || payload.restaurantId !== link.restaurantId || payload.slug !== slug) {
    throw new DomainError("VALIDATION_ERROR", "This storefront link is invalid or has expired.");
  }

  const auth = await getAuthContext(req);
  if (auth) {
    await AttributionRepository.recordSession({
      customerId: auth.user.id,
      restaurantId: link.restaurantId,
      token,
      sourceType: sourceType ?? "QR_SCAN",
    });
  }

  const maxAge = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
  const cookie = [
    `mp_attr=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");

  return apiSuccess(
    { restaurantId: link.restaurantId, expiresAt: new Date(payload.exp * 1000).toISOString() },
    200,
    { requestId, headers: { "Set-Cookie": cookie } }
  );
});

import { randomBytes } from "node:crypto";
import { AcquisitionChannel } from "@startup/contracts";
import {
  generateSignedMerchantLink,
  hashAttributionToken,
  verifyAttributionToken,
  decideAcquisitionChannel,
  type AttributionTokenPayload,
} from "@startup/core";
import { getDbPool } from "../client.js";

export interface AttributionLinkRow {
  id: string;
  restaurantId: string;
  slug: string;
  hmacSecret: string;
  qrVersion: number;
  createdAt: string;
}

function mapLink(row: any): AttributionLinkRow {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    slug: row.slug,
    hmacSecret: row.hmac_secret,
    qrVersion: row.qr_version,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

export class AttributionRepository {
  static async findLinkBySlug(slug: string): Promise<AttributionLinkRow | null> {
    const res = await getDbPool().query(`SELECT * FROM merchant_attribution_links WHERE slug = $1`, [slug]);
    return res.rows[0] ? mapLink(res.rows[0]) : null;
  }

  static async getOrCreateLink(restaurantId: string): Promise<AttributionLinkRow> {
    const existing = await getDbPool().query(
      `SELECT * FROM merchant_attribution_links WHERE restaurant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [restaurantId]
    );
    if (existing.rows[0]) return mapLink(existing.rows[0]);

    const restaurant = await getDbPool().query(`SELECT slug FROM restaurants WHERE id = $1`, [restaurantId]);
    if (!restaurant.rows[0]) throw new Error("Restaurant not found for attribution link");
    const secret = randomBytes(32).toString("base64url");
    const inserted = await getDbPool().query(
      `INSERT INTO merchant_attribution_links (restaurant_id, slug, hmac_secret)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [restaurantId, restaurant.rows[0].slug, secret]
    );
    if (inserted.rows[0]) return mapLink(inserted.rows[0]);
    const raced = await getDbPool().query(`SELECT * FROM merchant_attribution_links WHERE slug = $1`, [
      restaurant.rows[0].slug,
    ]);
    if (!raced.rows[0]) throw new Error("Failed to create attribution link");
    if (raced.rows[0].restaurant_id !== restaurantId) throw new Error("Attribution slug already belongs to another restaurant");
    return mapLink(raced.rows[0]);
  }

  static async buildSignedLink(input: {
    baseUrl: string;
    restaurantId: string;
    now?: Date;
    ttlSeconds?: number;
  }) {
    const link = await AttributionRepository.getOrCreateLink(input.restaurantId);
    return generateSignedMerchantLink({
      baseUrl: input.baseUrl,
      restaurantId: input.restaurantId,
      slug: link.slug,
      hmacSecret: link.hmacSecret,
      ttlSeconds: input.ttlSeconds,
      now: input.now,
    });
  }

  static async recordSession(input: {
    customerId: string;
    restaurantId: string;
    token: string;
    sourceType: "QR_SCAN" | "WHATSAPP_LINK" | "STOREFRONT_SLUG";
    now?: Date;
  }): Promise<AttributionTokenPayload | null> {
    const payload = await AttributionRepository.verifyTokenForRestaurant(
      input.token,
      input.restaurantId,
      input.now
    );
    if (!payload) return null;
    const expiresAt = new Date((input.now?.getTime() ?? Date.now()) + 24 * 60 * 60 * 1000);
    await getDbPool().query(
      `INSERT INTO customer_merchant_sessions
         (customer_id, restaurant_id, source_type, signed_token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (customer_id, restaurant_id)
       DO UPDATE SET source_type = EXCLUDED.source_type,
                     signed_token_hash = EXCLUDED.signed_token_hash,
                     expires_at = EXCLUDED.expires_at`,
      [input.customerId, input.restaurantId, input.sourceType, hashAttributionToken(input.token), expiresAt.toISOString()]
    );
    return payload;
  }

  static async verifyTokenForRestaurant(
    token: string,
    restaurantId: string,
    now?: Date
  ): Promise<AttributionTokenPayload | null> {
    const guessed = AttributionRepository.peekTokenPayload(token);
    if (!guessed) return null;
    const link = await AttributionRepository.findLinkBySlug(guessed.slug);
    if (!link || link.restaurantId !== restaurantId) return null;
    const payload = verifyAttributionToken(token, link.hmacSecret, now?.getTime() ?? Date.now());
    if (!payload || payload.restaurantId !== restaurantId) return null;
    return payload;
  }

  /** Decode without trusting: only used to find the per-link secret before verification. */
  private static peekTokenPayload(token: string): { slug: string; restaurantId: string } | null {
    const encoded = token.split(".")[0];
    if (!encoded) return null;
    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
        slug?: string;
        restaurantId?: string;
      };
      return parsed.slug && parsed.restaurantId ? { slug: parsed.slug, restaurantId: parsed.restaurantId } : null;
    } catch {
      return null;
    }
  }

  static async resolveCheckoutAttribution(input: {
    customerId: string;
    restaurantId: string;
    token?: string | null;
    now?: Date;
  }): Promise<AcquisitionChannel> {
    const now = input.now ?? new Date();
    if (input.token) {
      const payload = await AttributionRepository.verifyTokenForRestaurant(input.token, input.restaurantId, now);
      if (payload) {
        await AttributionRepository.recordSession({
          customerId: input.customerId,
          restaurantId: input.restaurantId,
          token: input.token,
          sourceType: "QR_SCAN",
          now,
        });
        return AcquisitionChannel.MERCHANT_DIRECT_SESSION;
      }
    }

    const session = await getDbPool().query(
      `SELECT 1 FROM customer_merchant_sessions
        WHERE customer_id = $1 AND restaurant_id = $2 AND expires_at > $3
        LIMIT 1`,
      [input.customerId, input.restaurantId, now.toISOString()]
    );
    const firstOrigin = await getDbPool().query(
      `SELECT 1 FROM app_users u
        WHERE u.id = $1
          AND (
            u.first_origin_restaurant_id = $2
            OR u.first_origin_merchant_id = (SELECT merchant_id FROM restaurants WHERE id = $2)
          )`,
      [input.customerId, input.restaurantId]
    );
    return decideAcquisitionChannel({
      hasValidSession: (session.rowCount ?? 0) > 0,
      isFirstOrigin: (firstOrigin.rowCount ?? 0) > 0,
    });
  }

  static async tagFirstOrigin(input: {
    customerId: string;
    restaurantId: string;
    channel: AcquisitionChannel;
  }): Promise<void> {
    if (
      input.channel !== AcquisitionChannel.MERCHANT_DIRECT_SESSION &&
      input.channel !== AcquisitionChannel.MERCHANT_FIRST_ORIGIN
    ) {
      return;
    }
    await getDbPool().query(
      `UPDATE app_users
          SET first_origin_restaurant_id = $2,
              first_origin_merchant_id = (SELECT merchant_id FROM restaurants WHERE id = $2),
              first_origin_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND first_origin_restaurant_id IS NULL`,
      [input.customerId, input.restaurantId]
    );
  }
}

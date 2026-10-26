import { NextRequest } from "next/server";
import { getDbPool } from "@startup/database";
import { StorageAdapter, sniffImageType } from "@startup/integrations";
import { DomainError } from "@startup/core";

/**
 * Stores a verified image. Object storage is used when configured; otherwise the
 * bytes live in Postgres behind an unguessable URL so local demos work.
 */
export async function storeImage(req: NextRequest, userId: string, bytes: Uint8Array): Promise<{ url: string; storage: string }> {
  const type = sniffImageType(bytes);
  if (!type) throw new DomainError("VALIDATION_ERROR", "Only JPEG, PNG or WebP images are allowed");
  const storage = new StorageAdapter();
  if (storage.isEnabled) {
    try {
      return { url: await storage.uploadImage(`uploads/${userId}`, bytes), storage: "object" };
    } catch (err) {
      throw new DomainError("VALIDATION_ERROR", (err as Error).message);
    }
  }
  const inserted = await getDbPool().query(
    `INSERT INTO uploaded_blobs (owner_user_id, mime, bytes) VALUES ($1, $2, $3) RETURNING id`,
    [userId, type, Buffer.from(bytes)]
  );
  const origin = new URL(req.url).origin;
  return { url: `${origin}/api/v1/uploads/${inserted.rows[0].id}`, storage: "database" };
}

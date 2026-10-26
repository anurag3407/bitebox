import { getDbPool } from "@startup/database";
import { apiError } from "@/server/api-response";
import { assertUuid, route } from "@/server/route";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serves a stored image by its unguessable id. Immutable, so it is cacheable forever. */
export const GET = route<{ uploadId: string }>(async (_req, { params }, requestId) => {
  const raw = (await params).uploadId;
  if (!UUID_RE.test(raw ?? "")) return apiError("NOT_FOUND", "Image not found", 404, undefined, { requestId });
  const uploadId = assertUuid(raw, "image");
  const res = await getDbPool().query(`SELECT mime, bytes FROM uploaded_blobs WHERE id = $1`, [uploadId]);
  const row = res.rows[0];
  if (!row) return apiError("NOT_FOUND", "Image not found", 404, undefined, { requestId });
  return new Response(new Uint8Array(row.bytes) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": row.mime as string,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

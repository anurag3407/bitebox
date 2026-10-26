import { z } from "zod";
import type { SearchSuggestionDto } from "@startup/contracts";
import { getDbPool } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseQuery, route } from "@/server/route";

const QuerySchema = z.object({
  q: z.string().trim().max(80).default(""),
});

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Autocomplete for the search field: matching restaurants, dishes and cuisines. */
export const GET = route(async (req, _ctx, requestId) => {
  await enforceRateLimit(req, "search");
  const { q } = parseQuery(req, QuerySchema);
  if (q.length < 2) return apiSuccess<SearchSuggestionDto[]>([], 200, { requestId });
  const pattern = likePattern(q);
  const pool = getDbPool();

  const [restaurants, cuisines, dishes] = await Promise.all([
    pool.query(
      `SELECT id, name, slug FROM restaurants
        WHERE is_active AND name ILIKE $1
        ORDER BY rating DESC, rating_count DESC LIMIT 4`,
      [pattern]
    ),
    pool.query(
      `SELECT DISTINCT cuisine FROM restaurants r, unnest(r.cuisines) AS cuisine
        WHERE r.is_active AND cuisine ILIKE $1
        ORDER BY cuisine LIMIT 3`,
      [pattern]
    ),
    pool.query(
      `SELECT DISTINCT ON (mi.name) mi.name, r.slug
         FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id
        WHERE r.is_active AND mi.archived_at IS NULL AND mi.name ILIKE $1
        ORDER BY mi.name, r.rating DESC LIMIT 4`,
      [pattern]
    ),
  ]);

  const suggestions: SearchSuggestionDto[] = [
    ...cuisines.rows.map((r) => ({ text: r.cuisine as string, type: "cuisine" as const })),
    ...restaurants.rows.map((r) => ({
      text: r.name as string,
      type: "restaurant" as const,
      targetId: r.id as string,
      targetSlug: r.slug as string,
    })),
    ...dishes.rows.map((r) => ({
      text: r.name as string,
      type: "dish" as const,
      targetSlug: r.slug as string,
    })),
  ].slice(0, 9);

  return apiSuccess(suggestions, 200, { requestId });
});

import { getDbPool } from "../client.js";

export interface PlatformConfigEntry {
  key: string;
  value: any;
  description?: string;
  updatedBy?: string;
  updatedAt: string;
}

export class PlatformConfigRepository {
  static async get<T = any>(key: string, defaultValue?: T): Promise<T> {
    const res = await getDbPool().query(`SELECT value FROM platform_config WHERE key = $1`, [key]);
    if (res.rows.length === 0) return defaultValue as T;
    return res.rows[0].value as T;
  }

  static async getAll(): Promise<Record<string, any>> {
    const res = await getDbPool().query(`SELECT key, value FROM platform_config ORDER BY key ASC`);
    const result: Record<string, any> = {};
    for (const row of res.rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  static async getAllEntries(): Promise<PlatformConfigEntry[]> {
    const res = await getDbPool().query(`SELECT * FROM platform_config ORDER BY key ASC`);
    return res.rows.map((r) => ({
      key: r.key,
      value: r.value,
      description: r.description ?? undefined,
      updatedBy: r.updated_by ?? undefined,
      updatedAt: (r.updated_at as Date).toISOString(),
    }));
  }

  static async set(key: string, value: any, adminUserId?: string): Promise<void> {
    await getDbPool().query(
      `INSERT INTO platform_config (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [key, JSON.stringify(value), adminUserId ?? null]
    );
  }

  static async setMany(entries: Record<string, any>, adminUserId?: string): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value, adminUserId);
    }
  }
}

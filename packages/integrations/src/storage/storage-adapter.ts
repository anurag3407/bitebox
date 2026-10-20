import { randomUUID } from "node:crypto";
import { getServerEnv } from "@startup/config";
import { fetchWithTimeout } from "../shared/http.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Detects the real image type from magic bytes; the client's Content-Type is not trusted. */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Public-read object storage for menu photos on Supabase Storage. */
export class StorageAdapter {
  private readonly env = getServerEnv();

  get isEnabled(): boolean {
    return !!(this.env.SUPABASE_URL && this.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  async uploadImage(folder: string, bytes: Uint8Array): Promise<string> {
    const type = sniffImageType(bytes);
    if (!type) throw new Error("Only JPEG, PNG or WebP images are allowed");
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Images must be 2 MB or smaller");
    if (!this.isEnabled) throw new Error("Image uploads are not configured; paste an image URL instead");

    const base = this.env.SUPABASE_URL!.replace(/\/$/, "");
    const path = `${folder.replace(/[^a-z0-9-]/gi, "")}/${randomUUID()}.${type.split("/")[1]}`;
    const res = await fetchWithTimeout(`${base}/storage/v1/object/${this.env.SUPABASE_STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: this.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-upsert": "false",
      },
      body: bytes as unknown as BodyInit,
      timeoutMs: 15_000,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return `${base}/storage/v1/object/public/${this.env.SUPABASE_STORAGE_BUCKET}/${path}`;
  }
}

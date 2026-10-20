import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Any configured secret is stretched to a 32-byte AES key
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf-8").digest();
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext), prefixed with a version tag. */
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  if (!payload.startsWith("v1:")) throw new Error("Unsupported ciphertext version");
  const raw = Buffer.from(payload.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf-8");
}

/** Shows only the last digits of an identifier, e.g. "XXXXXX1234". */
export function maskTail(value: string, visible = 4): string {
  return `${"X".repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}

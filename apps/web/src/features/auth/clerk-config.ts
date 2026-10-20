/**
 * A Clerk publishable key is `pk_(test|live)_<base64("frontend-api-host$")>`.
 * Placeholders fail this check, which switches the app to dev demo auth.
 */
export function isRealClerkKey(key: string | undefined): key is string {
  if (!key || !/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key)) return false;
  try {
    const decoded = typeof atob === "function" ? atob(key.split("_")[2]!) : Buffer.from(key.split("_")[2]!, "base64").toString();
    return decoded.endsWith("$") && decoded.includes(".");
  } catch {
    return false;
  }
}

export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
export const CLERK_ENABLED = isRealClerkKey(CLERK_PUBLISHABLE_KEY);

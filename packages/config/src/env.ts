import { z } from "zod";

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().default(3000),
  // Explicit opt-in for persona tokens (demo_customer, ...) outside NODE_ENV=development/test.
  // Never honoured when APP_ENV is staging or production.
  AUTH_DEMO_MODE: z.enum(["true", "false"]).optional(),

  // Database
  DATABASE_URL: z.string().default("postgresql://jarvis@localhost:5432/postgres"),
  MIGRATION_DATABASE_URL: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),

  // Clerk
  CLERK_SECRET_KEY: z.string().default("sk_test_dev_secret_key"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().default("whsec_dev_webhook_signing_secret"),
  // Frontend API URL, e.g. https://clerk.example.com or https://xyz.clerk.accounts.dev
  CLERK_ISSUER: z.string().url().optional(),
  // Defaults to `${CLERK_ISSUER}/.well-known/jwks.json`
  CLERK_JWKS_URL: z.string().url().optional(),
  // Origins allowed in the token `azp` claim; defaults to APP_ORIGIN
  CLERK_AUTHORIZED_PARTIES: csv,

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().optional().default("https://mock-redis.upstash.io"),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default("mock-redis-token"),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().default("mock_razorpay_secret"),
  RAZORPAY_WEBHOOK_SECRET: z.string().default("mock_razorpay_webhook_secret"),

  // Mapbox
  MAPBOX_SERVER_TOKEN: z.string().optional().default("mock_mapbox_server_token"),

  // Fast2SMS
  FAST2SMS_API_KEY: z.string().optional().default("mock_fast2sms_key"),
  FAST2SMS_SENDER_ID: z.string().optional().default("FSTSMS"),

  // Brevo
  BREVO_API_KEY: z.string().optional().default("mock_brevo_key"),
  BREVO_SENDER_EMAIL: z.string().email().default("support@fooddelivery.local"),
  BREVO_SENDER_NAME: z.string().default("Food Delivery Platform"),

  // Web push (PWA). Generate with `npx web-push generate-vapid-keys`.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:support@fooddelivery.local"),

  // Security
  OTP_ENCRYPTION_KEY: z.string().min(16).default("0123456789abcdef0123456789abcdef"),

  // Operations alerts (dispatch escalations, payment anomalies) are emailed here when set
  OPS_ALERT_EMAIL: z.string().email().optional(),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const ClientEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().default("pk_test_dev_publishable_key"),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().default("rzp_test_mock_key"),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().default("pk.mock_mapbox_public_token"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
export type ClientEnv = z.infer<typeof ClientEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;
let cachedClientEnv: ClientEnv | null = null;

const PLACEHOLDER_PATTERN = /(^mock|placeholder|^sk_test_dev|^whsec_dev|^0123456789abcdef)/i;

export function isStrictEnvironment(env: Pick<ServerEnv, "APP_ENV">): boolean {
  return env.APP_ENV === "production" || env.APP_ENV === "staging";
}

/**
 * Returns the problems that make an environment unsafe to serve real traffic.
 * Exported separately so deploy scripts and tests can check without throwing.
 */
export function findInsecureSettings(env: ServerEnv): string[] {
  const problems: string[] = [];
  const mustBeReal: Array<keyof ServerEnv> = [
    "CLERK_SECRET_KEY",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "OTP_ENCRYPTION_KEY",
  ];
  for (const key of mustBeReal) {
    const value = String(env[key] ?? "");
    if (!value || PLACEHOLDER_PATTERN.test(value)) problems.push(`${key} is unset or a placeholder`);
  }
  if (!env.CLERK_ISSUER) problems.push("CLERK_ISSUER is required to verify session tokens");
  if (!env.RAZORPAY_KEY_ID && !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
    problems.push("RAZORPAY_KEY_ID (or NEXT_PUBLIC_RAZORPAY_KEY_ID) is required");
  }
  if (env.AUTH_DEMO_MODE === "true") problems.push("AUTH_DEMO_MODE must not be enabled");
  if (!env.APP_ORIGIN.startsWith("https://")) problems.push("APP_ORIGIN must be an https:// URL");
  if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) problems.push("DATABASE_URL points at localhost");
  return problems;
}

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server environment configuration:", parsed.error.format());
    throw new Error("Invalid server environment configuration");
  }
  if (isStrictEnvironment(parsed.data)) {
    const problems = findInsecureSettings(parsed.data);
    if (problems.length > 0) {
      throw new Error(
        `Refusing to start in ${parsed.data.APP_ENV} with insecure configuration:\n - ${problems.join("\n - ")}`
      );
    }
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** Test helper: forget the cached environment so a test can change process.env. */
export function resetEnvCacheForTests(): void {
  cachedServerEnv = null;
  cachedClientEnv = null;
}

/**
 * Persona tokens are a developer convenience. They are only honoured outside
 * staging/production, and outside development/test only with AUTH_DEMO_MODE=true.
 */
export function isDemoAuthEnabled(env: ServerEnv = getServerEnv()): boolean {
  if (isStrictEnvironment(env)) return false;
  if (env.AUTH_DEMO_MODE === "false") return false;
  return env.AUTH_DEMO_MODE === "true" || env.NODE_ENV !== "production";
}

export function isMockSecret(value: string | undefined | null): boolean {
  return !value || PLACEHOLDER_PATTERN.test(value) || value.startsWith("pk.mock") || value.startsWith("rzp_test_mock");
}

export function getRazorpayKeyId(): string {
  return getServerEnv().RAZORPAY_KEY_ID || getClientEnv().NEXT_PUBLIC_RAZORPAY_KEY_ID;
}

export function getClientEnv(): ClientEnv {
  if (cachedClientEnv) return cachedClientEnv;
  const parsed = ClientEnvSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
  if (!parsed.success) {
    console.error("Invalid client environment configuration:", parsed.error.format());
    throw new Error("Invalid client environment configuration");
  }
  cachedClientEnv = parsed.data;
  return cachedClientEnv;
}

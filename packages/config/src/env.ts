import { z } from "zod";

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().default("postgresql://jarvis@localhost:5432/postgres"),
  MIGRATION_DATABASE_URL: z.string().optional(),

  // Clerk
  CLERK_SECRET_KEY: z.string().default("sk_test_dev_secret_key"),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().default("whsec_dev_webhook_signing_secret"),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().optional().default("https://mock-redis.upstash.io"),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default("mock-redis-token"),

  // Razorpay
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

  // Security
  OTP_ENCRYPTION_KEY: z.string().min(16).default("0123456789abcdef0123456789abcdef"),
});

export const ClientEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().default("pk_test_dev_publishable_key"),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().default("rzp_test_mock_key"),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().default("pk.mock_mapbox_public_token"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
export type ClientEnv = z.infer<typeof ClientEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;
let cachedClientEnv: ClientEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server environment configuration:", parsed.error.format());
    throw new Error("Invalid server environment configuration");
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function getClientEnv(): ClientEnv {
  if (cachedClientEnv) return cachedClientEnv;
  const parsed = ClientEnvSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  });
  if (!parsed.success) {
    console.error("Invalid client environment configuration:", parsed.error.format());
    throw new Error("Invalid client environment configuration");
  }
  cachedClientEnv = parsed.data;
  return cachedClientEnv;
}

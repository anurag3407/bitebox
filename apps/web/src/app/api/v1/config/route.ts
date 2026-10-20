import { getClientEnv, getRazorpayKeyId, getServerEnv, isDemoAuthEnabled, isMockSecret } from "@startup/config";
import { apiSuccess } from "@/server/api-response";

export const dynamic = "force-dynamic";

/** Public runtime configuration for web and native clients. */
export async function GET() {
  const clientEnv = getClientEnv();
  const serverEnv = getServerEnv();
  return apiSuccess({
    razorpayKeyId: getRazorpayKeyId(),
    mapboxToken: isMockSecret(clientEnv.NEXT_PUBLIC_MAPBOX_TOKEN) ? null : clientEnv.NEXT_PUBLIC_MAPBOX_TOKEN,
    clerkPublishableKey: clientEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    vapidPublicKey: serverEnv.VAPID_PUBLIC_KEY ?? clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    features: {
      onlinePayment: true,
      simulatedPayment: isMockSecret(serverEnv.RAZORPAY_KEY_SECRET),
      demoPersonas: isDemoAuthEnabled(serverEnv),
      instantDispatch: true,
      realtimeTracking: true,
      pushNotifications: Boolean(serverEnv.VAPID_PUBLIC_KEY && serverEnv.VAPID_PRIVATE_KEY),
      tipping: true,
    },
    supportedCity: "New Delhi",
    currency: "INR",
    minAppVersion: "1.0.0",
  });
}

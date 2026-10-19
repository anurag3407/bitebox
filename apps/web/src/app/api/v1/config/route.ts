import { NextRequest } from "next/server";
import { getClientEnv } from "@startup/config";
import { apiSuccess } from "@/server/api-response";

export async function GET(req: NextRequest) {
  const clientEnv = getClientEnv();
  return apiSuccess({
    razorpayKeyId: clientEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    mapboxToken: clientEnv.NEXT_PUBLIC_MAPBOX_TOKEN,
    clerkPublishableKey: clientEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    features: {
      onlinePayment: true,
      instantDispatch: true,
      realtimeTracking: true,
    },
    supportedCity: "New Delhi",
    currency: "INR",
  });
}

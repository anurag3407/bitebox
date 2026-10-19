import { NextRequest } from "next/server";
import { VerifyPaymentRequestSchema } from "@startup/contracts";
import { OrderRepository, getDb, paymentAttempts } from "@startup/database";
import { RazorpayAdapter } from "@startup/integrations";
import { apiError, apiSuccess } from "@/server/api-response";
import { getAuthenticatedActor, getOrCreateDbUser } from "@/server/auth-guard";
import { desc, eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedActor(req);
    if (!actor) {
      return apiError("UNAUTHENTICATED", "Authentication required to verify payment", 401);
    }

    const body = await req.json();
    const parsed = VerifyPaymentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid verification payload", 400, parsed.error.format());
    }

    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = parsed.data;

    // 1. Fetch order and check ownership
    const order = await OrderRepository.findById(orderId);
    if (!order) {
      return apiError("NOT_FOUND", "Order not found", 404);
    }

    const user = await getOrCreateDbUser(actor);
    if (actor.role === "CUSTOMER" && order.customerId && order.customerId !== user.id) {
      return apiError("FORBIDDEN", "You do not have permission to verify payment for this order", 403);
    }

    // 2. Fetch server-stored payment attempt and verify provider order ID match
    const db = getDb();
    const [attempt] = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.orderId, orderId))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(1);

    if (!attempt) {
      return apiError("NOT_FOUND", "No payment attempt found for this order", 404);
    }

    if (attempt.razorpayOrderId !== razorpayOrderId) {
      return apiError("VALIDATION_ERROR", "Razorpay order ID does not match server-stored attempt", 400);
    }

    // 3. Verify Cryptographic Signature against server-stored order ID
    const razorpayAdapter = new RazorpayAdapter();
    const isValid = razorpayAdapter.verifyPaymentSignature({
      orderId: attempt.razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return apiError("PAYMENT_FAILED", "Invalid Razorpay payment cryptographic signature", 400);
    }

    // 4. Record Capture & Transition to AWAITING_MERCHANT
    await OrderRepository.recordPaymentCapture({
      orderId,
      providerPaymentId: razorpayPaymentId,
      amountPaise: order.breakdown.payablePaise,
      paymentAttemptId: attempt.id,
    });

    return apiSuccess({
      success: true,
      orderId,
      status: "CAPTURED",
      fulfillmentState: "AWAITING_MERCHANT",
    });
  } catch (err: any) {
    return apiError("INTERNAL_ERROR", err.message || "Failed to verify payment", 500);
  }
}

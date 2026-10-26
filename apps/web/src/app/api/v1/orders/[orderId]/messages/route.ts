import { OrderMessageChannel, OrderMessageSchema, OrderMessageSender, UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import {
  OrderExperienceRepository,
  OrderRepository,
  RestaurantRepository,
  RiderRepository,
} from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertUuid, parseBody, parseQuery, route } from "@/server/route";
import { z } from "zod";

type Viewer =
  | { type: "CUSTOMER"; userId: string }
  | { type: "RIDER"; userId: string }
  | { type: "MERCHANT"; userId: string }
  | { type: "ADMIN"; userId: string };

async function resolveViewer(userId: string, role: string, orderId: string): Promise<Viewer> {
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access) throw new DomainError("NOT_FOUND", "Order not found");
  if (role === UserRole.ADMIN) return { type: "ADMIN", userId };
  if (access.customerId === userId) return { type: "CUSTOMER", userId };
  if (access.riderUserIds.includes(userId)) return { type: "RIDER", userId };
  if (role === UserRole.MERCHANT_STAFF) {
    const membership = await RestaurantRepository.getMembership(userId, access.restaurantId);
    if (membership) return { type: "MERCHANT", userId };
  }
  throw new DomainError("NOT_FOUND", "Order not found");
}

const QuerySchema = z.object({ channel: z.nativeEnum(OrderMessageChannel) });

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const viewer = await resolveViewer(auth.user.id, auth.role, orderId);
  const { channel } = parseQuery(req, QuerySchema);
  if (viewer.type === "RIDER" && channel !== OrderMessageChannel.CUSTOMER_RIDER) {
    throw new DomainError("FORBIDDEN", "Delivery partners can only use the rider chat.");
  }
  if (viewer.type === "MERCHANT" && channel !== OrderMessageChannel.CUSTOMER_MERCHANT) {
    throw new DomainError("FORBIDDEN", "Restaurants can only use the restaurant chat.");
  }
  const messages = await OrderExperienceRepository.listMessages(orderId, channel);
  if (viewer.type === "CUSTOMER") {
    await OrderExperienceRepository.markMessagesRead(orderId, channel, OrderMessageSender.CUSTOMER);
  }
  return apiSuccess({ channel, viewer: viewer.type, messages }, 200, { requestId });
});

export const POST = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  await enforceRateLimit(req, "support", auth.user.id);
  const orderId = assertUuid((await params).orderId, "order");
  const viewer = await resolveViewer(auth.user.id, auth.role, orderId);
  if (viewer.type === "ADMIN") throw new DomainError("FORBIDDEN", "Admins reply from the support console.");
  const body = await parseBody(req, OrderMessageSchema);
  if (viewer.type === "RIDER" && body.channel !== OrderMessageChannel.CUSTOMER_RIDER) {
    throw new DomainError("FORBIDDEN", "Delivery partners can only message the customer about the delivery.");
  }
  if (viewer.type === "MERCHANT" && body.channel !== OrderMessageChannel.CUSTOMER_MERCHANT) {
    throw new DomainError("FORBIDDEN", "Restaurants can only message the customer about their order.");
  }
  const access = await OrderRepository.findAccessContext(orderId);
  const state = access?.fulfillmentState;
  if (!state || ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"].includes(state)) {
    throw new DomainError("STATE_CONFLICT", "This order's chat is closed.");
  }
  // A rider must have an active trip to chat, not merely a pending offer
  if (viewer.type === "RIDER") {
    const rider = await RiderRepository.findByUserId(auth.user.id);
    const trip = rider ? await RiderRepository.getActiveTripForRider(rider.id) : null;
    if (!trip || trip.orderId !== orderId) {
      throw new DomainError("FORBIDDEN", "Chat is available once you accept the delivery.");
    }
  }
  const message = await OrderExperienceRepository.sendMessage({
    orderId,
    channel: body.channel,
    senderType: viewer.type as OrderMessageSender,
    senderUserId: auth.user.id,
    body: body.body,
  });
  return apiSuccess(message, 201, { requestId });
});

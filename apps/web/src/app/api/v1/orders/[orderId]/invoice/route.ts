import { UserRole } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { InvoiceRepository, OrderRepository } from "@startup/database";
import { apiSuccess } from "@/server/api-response";
import { requireAuth } from "@/server/auth-guard";
import { assertUuid, route } from "@/server/route";

export const GET = route<{ orderId: string }>(async (req, { params }, requestId) => {
  const auth = await requireAuth(req);
  const orderId = assertUuid((await params).orderId, "order");
  const access = await OrderRepository.findAccessContext(orderId);
  if (!access || (access.customerId !== auth.user.id && auth.role !== UserRole.ADMIN)) {
    throw new DomainError("NOT_FOUND", "Order not found");
  }
  const invoice = await InvoiceRepository.findByOrder(orderId);
  if (!invoice) throw new DomainError("NOT_FOUND", "The invoice is generated once the order is delivered.");
  return apiSuccess(invoice, 200, { requestId });
});

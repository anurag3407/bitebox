export function formatRupees(paise: number, opts: { decimals?: boolean } = {}): string {
  const rupees = paise / 100;
  const decimals = opts.decimals ?? !Number.isInteger(rupees);
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

export function formatDistance(meters?: number): string | undefined {
  if (meters === undefined) return undefined;
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

export const STATE_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  AWAITING_MERCHANT: "Waiting for restaurant",
  ACCEPTED: "Order confirmed",
  PREPARING: "Preparing your food",
  READY_FOR_PICKUP: "Ready for pickup",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  DELIVERY_FAILED: "Delivery failed",
};

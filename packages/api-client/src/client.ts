import type { MenuItemInputRaw, RestaurantSettings, SupportCategory } from "@startup/contracts";
import {
  AddressDto,
  CheckoutResponse,
  Coordinate,
  CreateAddressRequestInput,
  CreateCheckoutRequest,
  CreateOrderRatingRequest,
  CreateQuoteRequestInput,
  DeliveryTripStatus,
  FulfillmentState,
  ModifierOptionDto,
  OrderDetailDto,
  OrderSummaryDto,
  PaymentStatus,
  PushSubscriptionRequest,
  QuoteResponse,
  RestaurantDetailDto,
  RestaurantListRequest,
  RestaurantListResponse,
  RestaurantReviewDto,
  RestaurantSummaryDto,
  SearchResultDto,
  ServiceabilityCheckResponse,
  VerifyPaymentRequest,
} from "@startup/contracts";

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => Promise<string | null> | string | null;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** Error thrown for any non-2xx response; `code` mirrors the server ErrorCode. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(message: string, code: string, status: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

export interface TrackingSnapshot {
  order: OrderDetailDto;
  restaurantLocation?: Coordinate;
  rider: {
    name: string;
    phone?: string;
    vehicleType?: string;
    location?: Coordinate;
    headingDegrees?: number;
    lastLocationUpdatedAt?: string;
    isStale: boolean;
    tripStatus: string;
  } | null;
  etaMinutes?: number;
  timeline: Array<{ state: FulfillmentState; at: string; reason?: string; actor: string }>;
  isTerminal: boolean;
}

export interface ReorderResponse {
  restaurant: { id: string; name: string; slug: string; isAcceptingOrders: boolean };
  lines: Array<{
    menuItemId: string;
    name: string;
    variantId?: string;
    variantName?: string;
    selectedOptions: ModifierOptionDto[];
    basePricePaise: number;
    quantity: number;
    instructions?: string;
    imageUrl?: string;
  }>;
  unavailable: string[];
}

export interface AvailableCoupon {
  code: string;
  description?: string;
  type: "PERCENTAGE" | "FLAT" | "FREE_DELIVERY";
  minOrderPaise: number;
  maxDiscountPaise?: number;
  firstOrderOnly: boolean;
}

export interface MeResponse {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "CUSTOMER" | "MERCHANT_STAFF" | "RIDER" | "ADMIN";
  rider: { id: string; isOnline: boolean; isApproved: boolean; vehicleType: string } | null;
  restaurants: Array<{ id: string; name: string; slug: string; staffRole: string; isAcceptingOrders: boolean; isOpen: boolean }>;
}

export interface RiderTripResponse {
  rider: { id: string; name: string; isOnline: boolean; lastPingAt?: string };
  hasActiveTrip: boolean;
  assignment?: {
    id: string;
    status: DeliveryTripStatus;
    assignedAt: string;
    otpFailedAttempts: number;
    arrivedDropoffAt?: string;
  };
  order?: OrderDetailDto | null;
  pickupLocation?: Coordinate | null;
  pendingOffer?: { id: string; orderId: string; expiresAt: string; distanceToPickupMeters?: number } | null;
  offerOrder?: OrderDetailDto | null;
}

export interface AdminOrderRow {
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  customerAddress: string;
  riderName?: string;
  fulfillmentState: FulfillmentState;
  paymentStatus: PaymentStatus;
  payablePaise: number;
  refundedPaise: number;
  createdAt: string;
  updatedAt: string;
  promisedDeliveryAt?: string;
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
}


export interface PartnerApplication {
  id: string;
  userId: string;
  applicantName: string;
  applicantEmail: string | null;
  type: "MERCHANT" | "RIDER";
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  details: Record<string, any>;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
  restaurantId?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "CUSTOMER" | "MERCHANT_STAFF" | "RIDER" | "ADMIN";
  isActive: boolean;
  createdAt: string;
  restaurants: string[];
  riderId?: string;
}

export interface Payout {
  id: string;
  ownerType: "MERCHANT" | "RIDER";
  ownerId: string;
  ownerName: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  amountPaise: number;
  status: "PENDING" | "MANUAL" | "PROCESSING" | "PAID" | "FAILED";
  utr?: string;
  failureReason?: string;
  paidAt?: string;
  createdAt: string;
}

export interface Earnings {
  unsettledPaise: number;
  unsettledOrders: number;
  todayPaise: number;
  todayOrders: number;
  payouts: Payout[];
  account: { accountHolderName: string; ifsc: string; accountLast4: string; updatedAt: string } | null;
}

export interface MerchantAnalyticsChannel {
  channel: string;
  orders: number;
  gmvPaise: number;
  platformFeesPaise: number;
  merchantPayoutPaise: number;
  onTimeOrders: number;
  deliveredOrders: number;
  defectRefunds: number;
  refundedOrders: number;
  gmvSharePercent: number;
}

export interface MerchantAnalytics {
  restaurantId: string;
  startDate: string;
  endDate: string;
  totalOrders: number;
  totalGmvPaise: number;
  totalPlatformFeesPaise: number;
  totalMerchantPayoutPaise: number;
  effectiveTakeRatePercent: number;
  incumbentBenchmarkPaise: number;
  netRupeesSavedPaise: number;
  onTimeHandoverRatePercent: number;
  defectRefundRatePercent: number;
  reliabilityRebateEligible: boolean;
  reliabilityRebateBp: number;
  reliabilityRebatePaise: number;
  channels: MerchantAnalyticsChannel[];
}

export interface MerchantAttributionLink {
  restaurantId: string;
  slug: string;
  url: string;
  token: string;
  expiresAt: string;
}

export interface EditableMenuItem extends MenuItemInputRaw {
  id: string;
}

export interface EditableMenu {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    phone: string | null;
    packagingFeePaise: number;
    avgPrepMinutes: number;
    avgPriceForOnePaise: number;
    heroImageUrl: string | null;
    isOpen: boolean;
    openingHours: RestaurantSettings["openingHours"];
  };
  categories: Array<{ id: string; name: string; isActive: boolean; displayOrder: number; items: EditableMenuItem[] }>;
}

export interface SupportTicket {
  id: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  orderNumber?: string;
  category: SupportCategory;
  status: "OPEN" | "AWAITING_CUSTOMER" | "RESOLVED";
  resolution?: string;
  lastMessageAt: string;
  createdAt: string;
  lastMessage?: string;
}

export interface SupportThread {
  ticket: SupportTicket;
  messages: Array<{ id: string; senderType: "CUSTOMER" | "AGENT" | "SYSTEM"; senderName?: string; body: string; createdAt: string }>;
}

export interface InvoiceSectionDto {
  title: string;
  sac: string;
  ratePercent: number;
  lines: Array<{ description: string; quantity?: number; amountPaise: number }>;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
}

export interface InvoiceDto {
  invoice: {
    invoiceNumber: string;
    issuedAt: string;
    orderNumber: string;
    orderDate: string;
    platform: { legalName: string; gstin: string; address: string };
    restaurant: { name: string; address: string; gstin: string | null; fssai: string | null };
    customer: { name: string; address: string };
    food: InvoiceSectionDto;
    services: InvoiceSectionDto;
    tipPaise: number;
    grandTotalPaise: number;
    paymentMode: string;
  };
  creditNotes: Array<{ creditNoteNumber: string; invoiceNumber: string; issuedAt: string; amountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; reason: string }>;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export class ApiClient {
  private baseUrl: string;
  private getToken?: () => Promise<string | null> | string | null;
  private fetchFn: typeof fetch;
  private timeoutMs: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.getToken = config.getToken;
    this.fetchFn = config.fetchFn || ((...args) => fetch(...args));
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  async authHeaders(): Promise<Record<string, string>> {
    const token = this.getToken ? await this.getToken() : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
    for (const [k, v] of Object.entries(await this.authHeaders())) headers.set(k, v);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        ...options,
        headers,
        signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // One retry for idempotent reads on network failure (flaky mobile data)
      const method = (options.method ?? "GET").toUpperCase();
      if (method === "GET" && attempt === 0) return this.request<T>(path, options, 1);
      throw new ApiError(
        "You appear to be offline. Check your connection and try again.",
        "NETWORK_ERROR",
        0,
        (err as Error)?.message
      );
    }

    const text = await response.text();
    let json: any = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      // Proxies return HTML on 502/504; never surface that to users
    }

    if (!response.ok) {
      throw new ApiError(
        json?.error?.message || (response.status >= 500 ? "Something went wrong. Please try again." : response.statusText) || "Request failed",
        json?.error?.code || "REQUEST_FAILED",
        response.status,
        json?.error?.details,
        json?.meta?.requestId ?? response.headers.get("x-request-id") ?? undefined
      );
    }

    return (json?.data !== undefined ? json.data : json) as T;
  }

  // 1. Serviceability & Discovery
  async checkServiceability(location: Coordinate, restaurantId?: string): Promise<ServiceabilityCheckResponse> {
    return this.request<ServiceabilityCheckResponse>("/api/v1/serviceability/check", {
      method: "POST",
      body: JSON.stringify({ ...location, restaurantId }),
    });
  }

  async getRestaurants(params: Partial<RestaurantListRequest> = {}): Promise<RestaurantListResponse> {
    return this.request<RestaurantListResponse>(`/api/v1/restaurants${qs(params as Record<string, string | number | boolean | undefined>)}`);
  }

  async getRestaurantBySlug(slug: string): Promise<RestaurantDetailDto> {
    return this.request<RestaurantDetailDto>(`/api/v1/restaurants/${encodeURIComponent(slug)}`);
  }

  async getRestaurantReviews(slug: string): Promise<RestaurantReviewDto[]> {
    return this.request<RestaurantReviewDto[]>(`/api/v1/restaurants/${encodeURIComponent(slug)}/reviews`);
  }

  async search(query: string, location?: Coordinate, pureVeg?: boolean): Promise<SearchResultDto> {
    return this.request<SearchResultDto>(
      `/api/v1/search${qs({ q: query, latitude: location?.latitude, longitude: location?.longitude, pureVeg })}`
    );
  }

  async getAvailableCoupons(restaurantId?: string): Promise<AvailableCoupon[]> {
    return this.request<AvailableCoupon[]>(`/api/v1/coupons${qs({ restaurantId })}`);
  }

  async geocode(params: { q?: string; latitude?: number; longitude?: number }): Promise<{ results: GeocodeResult[]; enabled: boolean }> {
    return this.request(`/api/v1/geocode${qs(params)}`);
  }

  // 2. Account, addresses, favourites
  async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>("/api/v1/me");
  }

  async updateMe(update: { name?: string; phone?: string }): Promise<MeResponse> {
    return this.request<MeResponse>("/api/v1/me", { method: "PATCH", body: JSON.stringify(update) });
  }

  async getAddresses(): Promise<AddressDto[]> {
    return this.request<AddressDto[]>("/api/v1/addresses");
  }

  async createAddress(address: CreateAddressRequestInput): Promise<AddressDto> {
    return this.request<AddressDto>("/api/v1/addresses", { method: "POST", body: JSON.stringify(address) });
  }

  async updateAddress(addressId: string, address: CreateAddressRequestInput): Promise<AddressDto> {
    return this.request<AddressDto>(`/api/v1/addresses/${addressId}`, { method: "PATCH", body: JSON.stringify(address) });
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.request(`/api/v1/addresses/${addressId}`, { method: "DELETE" });
  }

  async setDefaultAddress(addressId: string): Promise<void> {
    await this.request(`/api/v1/addresses/${addressId}/default`, { method: "POST" });
  }

  async getFavorites(location?: Coordinate): Promise<RestaurantSummaryDto[]> {
    return this.request<RestaurantSummaryDto[]>(`/api/v1/favorites${qs({ latitude: location?.latitude, longitude: location?.longitude })}`);
  }

  async setFavorite(restaurantId: string, isFavorite: boolean): Promise<void> {
    await this.request(`/api/v1/favorites/${restaurantId}`, { method: isFavorite ? "PUT" : "DELETE" });
  }

  async subscribePush(subscription: PushSubscriptionRequest): Promise<void> {
    await this.request("/api/v1/push/subscriptions", { method: "POST", body: JSON.stringify(subscription) });
  }

  async unsubscribePush(endpoint: string): Promise<void> {
    await this.request("/api/v1/push/subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
  }

  // 3. Quotes & Checkout
  async createQuote(request: CreateQuoteRequestInput): Promise<QuoteResponse> {
    return this.request<QuoteResponse>("/api/v1/quotes", { method: "POST", body: JSON.stringify(request) });
  }

  async createCheckout(request: CreateCheckoutRequest): Promise<CheckoutResponse> {
    return this.request<CheckoutResponse>("/api/v1/checkouts", { method: "POST", body: JSON.stringify(request) });
  }

  // 4. Payments
  async verifyPayment(
    request: VerifyPaymentRequest
  ): Promise<{ success: boolean; orderId: string; status?: string; fulfillmentState?: string; outcome?: string }> {
    return this.request("/api/v1/payments/verify", { method: "POST", body: JSON.stringify(request) });
  }

  // 5. Orders & Tracking
  async getOrder(orderId: string): Promise<OrderDetailDto> {
    return this.request<OrderDetailDto>(`/api/v1/orders/${orderId}`);
  }

  async getOrderTracking(orderId: string): Promise<TrackingSnapshot> {
    return this.request<TrackingSnapshot>(`/api/v1/orders/${orderId}/tracking`);
  }

  async getCustomerOrders(params: { before?: string; limit?: number } = {}): Promise<OrderSummaryDto[]> {
    return this.request<OrderSummaryDto[]>(`/api/v1/orders${qs(params)}`);
  }

  async cancelOrder(orderId: string, reason?: string): Promise<{ fulfillmentState: FulfillmentState; refundedPaise: number }> {
    return this.request(`/api/v1/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
  }

  async rateOrder(orderId: string, rating: CreateOrderRatingRequest): Promise<void> {
    await this.request(`/api/v1/orders/${orderId}/rating`, { method: "POST", body: JSON.stringify(rating) });
  }

  async getReorder(orderId: string): Promise<ReorderResponse> {
    return this.request<ReorderResponse>(`/api/v1/orders/${orderId}/reorder`);
  }

  // 6. Merchant Console
  async getMerchantRestaurants(): Promise<MeResponse["restaurants"]> {
    return this.request(`/api/v1/merchant/restaurants`);
  }

  async getMerchantOrders(restaurantId?: string, scope: "active" | "all" = "active"): Promise<OrderDetailDto[]> {
    return this.request<OrderDetailDto[]>(`/api/v1/merchant/orders${qs({ restaurantId, scope })}`);
  }

  async merchantAcceptOrder(orderId: string, prepMinutes: number): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/accept`, {
      method: "POST",
      body: JSON.stringify({ preparationTimeMinutes: prepMinutes }),
    });
  }

  async merchantRejectOrder(orderId: string, reason: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
  }

  async merchantMarkPreparing(orderId: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/preparing`, { method: "POST" });
  }

  async merchantMarkReady(orderId: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/ready`, { method: "POST" });
  }

  async merchantSetAcceptingOrders(restaurantId: string, isAcceptingOrders: boolean): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isAcceptingOrders }),
    });
  }

  async merchantSetItemAvailability(restaurantId: string, itemId: string, isAvailable: boolean): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ isAvailable }),
    });
  }

  // 7. Rider Portal
  async getRiderActiveTrip(): Promise<RiderTripResponse> {
    return this.request<RiderTripResponse>("/api/v1/rider/trip");
  }

  async riderSetOnline(isOnline: boolean): Promise<void> {
    await this.request("/api/v1/rider/status", { method: "POST", body: JSON.stringify({ isOnline }) });
  }

  async riderAcceptOffer(offerId: string): Promise<{ assignmentId: string }> {
    return this.request<{ assignmentId: string }>(`/api/v1/rider/offers/${offerId}/accept`, { method: "POST" });
  }

  async riderRejectOffer(offerId: string, reason?: string): Promise<void> {
    await this.request(`/api/v1/rider/offers/${offerId}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
  }

  async riderUpdateLocation(
    location: Coordinate & { accuracyMeters?: number; headingDegrees?: number; speedMps?: number; capturedAt?: string }
  ): Promise<{ accepted: boolean }> {
    return this.request("/api/v1/rider/location", {
      method: "POST",
      body: JSON.stringify({ ...location, capturedAt: location.capturedAt ?? new Date().toISOString() }),
    });
  }

  async riderUpdateMilestone(input: {
    assignmentId: string;
    nextStatus: "AT_PICKUP" | "PICKED_UP" | "AT_DROPOFF" | "COMPLETED" | "FAILED";
    challengeCode?: string;
    failureReason?: string;
  }): Promise<{ status: string; fulfillmentState: FulfillmentState }> {
    return this.request(`/api/v1/rider/trip/milestone`, { method: "POST", body: JSON.stringify(input) });
  }

  // 8. Admin Operations
  async getAdminOrders(params: { state?: FulfillmentState; stuck?: boolean } = {}): Promise<AdminOrderRow[]> {
    return this.request<AdminOrderRow[]>(`/api/v1/admin/orders${qs(params)}`);
  }

  async getAdminOrderDetail(orderId: string): Promise<{
    order: OrderDetailDto;
    events: Array<{ sequence: number; sourceState: string; targetState: string; actorType: string; reason?: string; createdAt: string }>;
    refunds: Array<{ id: string; status: string; amountPaise: number; reason: string; providerRefundId?: string; createdAt: string; processedAt?: string }>;
  }> {
    return this.request(`/api/v1/admin/orders/${orderId}/detail`);
  }

  async getAdminOverview(): Promise<any> {
    return this.request("/api/v1/admin/overview");
  }

  async getAdminRiders(): Promise<any[]> {
    return this.request("/api/v1/admin/riders");
  }

  async adminRefundOrder(orderId: string, amountPaise: number, reason: string): Promise<void> {
    await this.request(`/api/v1/admin/orders/${orderId}/refund`, { method: "POST", body: JSON.stringify({ amountPaise, reason }) });
  }

  async adminCancelOrder(orderId: string, reason: string, refundAmountPaise?: number): Promise<void> {
    await this.request(`/api/v1/admin/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, refundAmountPaise }),
    });
  }

  async adminAssignRider(orderId: string, riderId: string, reason: string): Promise<void> {
    await this.request(`/api/v1/admin/orders/${orderId}/assign`, { method: "POST", body: JSON.stringify({ riderId, reason }) });
  }

  // 9. Partner onboarding
  async getMyApplications(): Promise<PartnerApplication[]> {
    return this.request("/api/v1/partner/applications");
  }

  async submitApplication(type: "MERCHANT" | "RIDER", details: Record<string, unknown>): Promise<PartnerApplication> {
    return this.request("/api/v1/partner/applications", { method: "POST", body: JSON.stringify({ type, details }) });
  }

  async getApplications(status: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED"): Promise<PartnerApplication[]> {
    return this.request(`/api/v1/admin/applications${qs({ status })}`);
  }

  async reviewApplication(id: string, decision: "APPROVE" | "REJECT", note?: string): Promise<PartnerApplication> {
    return this.request(`/api/v1/admin/applications/${id}/review`, { method: "POST", body: JSON.stringify({ decision, note }) });
  }

  async searchUsers(q: string): Promise<AdminUser[]> {
    return this.request(`/api/v1/admin/users${qs({ q })}`);
  }

  async updateUser(userId: string, update: { role?: AdminUser["role"]; isActive?: boolean; reason: string }): Promise<void> {
    await this.request(`/api/v1/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(update) });
  }

  // 10. Menu editor & outlet settings
  async getEditableMenu(restaurantId: string): Promise<EditableMenu> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu`);
  }

  async createMenuCategory(restaurantId: string, name: string): Promise<{ id: string }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu/categories`, { method: "POST", body: JSON.stringify({ name }) });
  }

  async updateMenuCategory(restaurantId: string, categoryId: string, update: { name?: string; isActive?: boolean; displayOrder?: number }): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu/categories/${categoryId}`, { method: "PATCH", body: JSON.stringify(update) });
  }

  async deleteMenuCategory(restaurantId: string, categoryId: string): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu/categories/${categoryId}`, { method: "DELETE" });
  }

  async saveMenuItem(restaurantId: string, item: MenuItemInputRaw & { id?: string }): Promise<{ id: string }> {
    const { id, ...body } = item;
    return id
      ? this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu/items/${id}`, { method: "PUT", body: JSON.stringify(body) })
      : this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu/items`, { method: "POST", body: JSON.stringify(body) });
  }

  async deleteMenuItem(restaurantId: string, itemId: string): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/menu/items/${itemId}`, { method: "DELETE" });
  }

  async uploadMenuImage(restaurantId: string, file: Blob): Promise<{ url: string }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/images`, {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
  }

  async updateRestaurantSettings(restaurantId: string, settings: Partial<RestaurantSettings>): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/settings`, { method: "PATCH", body: JSON.stringify(settings) });
  }

  async getStaff(restaurantId: string): Promise<Array<{ userId: string; name: string; email: string | null; staffRole: string }>> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/staff`);
  }

  async addStaff(restaurantId: string, email: string, staffRole: string): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/staff`, { method: "POST", body: JSON.stringify({ email, staffRole }) });
  }

  async removeStaff(restaurantId: string, userId: string): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/staff/${userId}`, { method: "DELETE" });
  }

  // 11. Earnings & payouts
  async getMerchantEarnings(restaurantId: string): Promise<Earnings> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/earnings`);
  }

  async getMerchantAnalytics(restaurantId: string, range?: { from?: string; to?: string }): Promise<MerchantAnalytics> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/analytics${qs(range ?? {})}`);
  }

  async getMerchantAttributionLink(restaurantId: string): Promise<MerchantAttributionLink> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/attribution-link`);
  }

  async saveMerchantPayoutAccount(restaurantId: string, account: { accountHolderName: string; ifsc: string; accountNumber: string }): Promise<{ accountLast4: string }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/payout-account`, { method: "PUT", body: JSON.stringify(account) });
  }

  async getRiderEarnings(): Promise<Earnings> {
    return this.request("/api/v1/rider/earnings");
  }

  async saveRiderPayoutAccount(account: { accountHolderName: string; ifsc: string; accountNumber: string }): Promise<{ accountLast4: string }> {
    return this.request("/api/v1/rider/payout-account", { method: "PUT", body: JSON.stringify(account) });
  }

  async getAdminPayouts(status?: Payout["status"]): Promise<Payout[]> {
    return this.request(`/api/v1/admin/payouts${qs({ status })}`);
  }

  async runSettlement(): Promise<{ created: number }> {
    return this.request("/api/v1/admin/payouts/run", { method: "POST" });
  }

  async markPayoutPaid(payoutId: string, utr: string): Promise<void> {
    await this.request(`/api/v1/admin/payouts/${payoutId}/mark-paid`, { method: "POST", body: JSON.stringify({ utr }) });
  }

  async switchPayoutToManual(payoutId: string): Promise<void> {
    await this.request(`/api/v1/admin/payouts/${payoutId}/manual`, { method: "POST" });
  }

  // 12. Invoices, calls, support, privacy
  async getInvoice(orderId: string): Promise<InvoiceDto> {
    return this.request(`/api/v1/orders/${orderId}/invoice`);
  }

  async placeCall(orderId: string, target: "RIDER" | "CUSTOMER" | "RESTAURANT"): Promise<{ mode: "BRIDGED"; message: string } | { mode: "DIRECT"; phone: string }> {
    return this.request(`/api/v1/orders/${orderId}/call`, { method: "POST", body: JSON.stringify({ target }) });
  }

  async getMyTickets(): Promise<SupportTicket[]> {
    return this.request("/api/v1/support");
  }

  async openTicket(input: { orderId?: string; category: SupportCategory; message: string }): Promise<{ ticketId: string }> {
    return this.request("/api/v1/support", { method: "POST", body: JSON.stringify(input) });
  }

  async getTicket(ticketId: string, asAdmin = false): Promise<SupportThread> {
    return this.request(asAdmin ? `/api/v1/admin/support/${ticketId}` : `/api/v1/support/${ticketId}`);
  }

  async replyToTicket(ticketId: string, body: string, asAdmin = false): Promise<void> {
    await this.request(asAdmin ? `/api/v1/admin/support/${ticketId}` : `/api/v1/support/${ticketId}`, { method: "POST", body: JSON.stringify({ body }) });
  }

  async getSupportQueue(status?: SupportTicket["status"]): Promise<SupportTicket[]> {
    return this.request(`/api/v1/admin/support${qs({ status })}`);
  }

  async resolveTicket(ticketId: string, resolution: string): Promise<void> {
    await this.request(`/api/v1/admin/support/${ticketId}/resolve`, { method: "POST", body: JSON.stringify({ resolution }) });
  }

  async deleteAccount(): Promise<void> {
    await this.request("/api/v1/me", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
  }
}

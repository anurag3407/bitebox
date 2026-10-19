import {
  AddressDto,
  Coordinate,
  CreateAddressRequest,
  CreateCheckoutRequest,
  CreateQuoteRequest,
  DeliveryTripStatus,
  OrderDetailDto,
  OrderSummaryDto,
  QuoteResponse,
  RestaurantDetailDto,
  RestaurantSummaryDto,
  SearchResultDto,
  ServiceabilityCheckResponse,
  VerifyPaymentRequest,
} from "@startup/contracts";

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => Promise<string | null> | string | null;
  fetchFn?: typeof fetch;
}

export class ApiClient {
  private baseUrl: string;
  private getToken?: () => Promise<string | null> | string | null;
  private fetchFn: typeof fetch;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.getToken = config.getToken;
    this.fetchFn = config.fetchFn || fetch;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers);

    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }

    if (this.getToken) {
      const token = await this.getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    const response = await this.fetchFn(url, {
      ...options,
      headers,
    });

    const json = await response.json();

    if (!response.ok) {
      const errorMsg = json?.error?.message || response.statusText || "Request failed";
      const error = new Error(errorMsg);
      (error as any).code = json?.error?.code || "REQUEST_FAILED";
      (error as any).status = response.status;
      (error as any).details = json?.error?.details;
      throw error;
    }

    return json.data !== undefined ? json.data : json;
  }

  // 1. Serviceability & Discovery
  async checkServiceability(location: Coordinate, restaurantId?: string): Promise<ServiceabilityCheckResponse> {
    return this.request<ServiceabilityCheckResponse>("/api/v1/serviceability/check", {
      method: "POST",
      body: JSON.stringify({ ...location, restaurantId }),
    });
  }

  async getRestaurants(params: { pureVeg?: boolean; cuisine?: string } = {}): Promise<RestaurantSummaryDto[]> {
    const searchParams = new URLSearchParams();
    if (params.pureVeg) searchParams.set("pureVeg", "true");
    if (params.cuisine) searchParams.set("cuisine", params.cuisine);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<RestaurantSummaryDto[]>(`/api/v1/restaurants${query}`);
  }

  async getRestaurantBySlug(slug: string): Promise<RestaurantDetailDto> {
    return this.request<RestaurantDetailDto>(`/api/v1/restaurants/${slug}`);
  }

  async search(query: string, location: Coordinate, pureVeg?: boolean): Promise<SearchResultDto> {
    const searchParams = new URLSearchParams({
      q: query,
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
    });
    if (pureVeg) searchParams.set("pureVeg", "true");
    return this.request<SearchResultDto>(`/api/v1/search?${searchParams.toString()}`);
  }

  // 2. Addresses
  async getAddresses(): Promise<AddressDto[]> {
    return this.request<AddressDto[]>("/api/v1/addresses");
  }

  async createAddress(address: CreateAddressRequest): Promise<AddressDto> {
    return this.request<AddressDto>("/api/v1/addresses", {
      method: "POST",
      body: JSON.stringify(address),
    });
  }

  // 3. Quotes & Checkout
  async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    return this.request<QuoteResponse>("/api/v1/quotes", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async createCheckout(request: CreateCheckoutRequest): Promise<{
    orderId: string;
    orderNumber: string;
    paymentAttemptId: string;
    razorpayOrderId: string;
  }> {
    return this.request("/api/v1/checkouts", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // 4. Payments
  async verifyPayment(request: VerifyPaymentRequest): Promise<{ success: boolean; orderId: string }> {
    return this.request("/api/v1/payments/verify", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // 5. Orders & Tracking
  async getOrder(orderId: string): Promise<OrderDetailDto> {
    return this.request<OrderDetailDto>(`/api/v1/orders/${orderId}`);
  }

  async getCustomerOrders(): Promise<OrderSummaryDto[]> {
    return this.request<OrderSummaryDto[]>("/api/v1/orders");
  }

  // 6. Merchant Console
  async getMerchantOrders(restaurantId: string): Promise<OrderDetailDto[]> {
    return this.request<OrderDetailDto[]>(`/api/v1/merchant/orders?restaurantId=${restaurantId}`);
  }

  async merchantAcceptOrder(orderId: string, prepMinutes: number): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/accept`, {
      method: "POST",
      body: JSON.stringify({ preparationTimeMinutes: prepMinutes }),
    });
  }

  async merchantRejectOrder(orderId: string, reason: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async merchantMarkPreparing(orderId: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/preparing`, {
      method: "POST",
    });
  }

  async merchantMarkReady(orderId: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/ready`, {
      method: "POST",
    });
  }

  // 7. Rider Portal
  async getRiderActiveTrip(): Promise<any> {
    return this.request("/api/v1/rider/trip");
  }

  async riderAcceptOffer(offerId: string): Promise<{ assignmentId: string }> {
    return this.request<{ assignmentId: string }>(`/api/v1/rider/offers/${offerId}/accept`, {
      method: "POST",
    });
  }

  async riderUpdateLocation(location: Coordinate): Promise<void> {
    await this.request("/api/v1/rider/location", {
      method: "POST",
      body: JSON.stringify({ ...location, capturedAt: new Date().toISOString() }),
    });
  }

  async riderUpdateMilestone(
    assignmentId: string,
    orderId: string,
    nextStatus: DeliveryTripStatus,
    challengeCode?: string
  ): Promise<void> {
    await this.request(`/api/v1/rider/trip/milestone`, {
      method: "POST",
      body: JSON.stringify({ assignmentId, orderId, nextStatus, challengeCode }),
    });
  }

  // 8. Admin Operations
  async getAdminOrders(): Promise<OrderDetailDto[]> {
    return this.request<OrderDetailDto[]>("/api/v1/admin/orders");
  }

  async adminRefundOrder(orderId: string, amountPaise: number, reason: string): Promise<void> {
    await this.request(`/api/v1/admin/orders/${orderId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amountPaise, reason }),
    });
  }
}

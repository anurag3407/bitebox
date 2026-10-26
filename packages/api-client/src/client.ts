import type { MenuItemInputRaw, MerchantCouponInput, RestaurantSettings, SupportCategory } from "@startup/contracts";
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
  GroupCartDto,
  DiningEventDto,
  DiningEventBookingDto,
  CollectionSummaryDto,
  CollectionDetailDto,
  SearchResultDto,
  ServiceabilityCheckResponse,
  VerifyPaymentRequest,
} from "@startup/contracts";

export interface WalletSummaryDto {
  account: { userId: string; balancePaise: number; lifetimeCreditedPaise: number; lifetimeSpentPaise: number; updatedAt: string };
  transactions: Array<{
    id: string;
    kind: string;
    direction: "CREDIT" | "DEBIT";
    amountPaise: number;
    balanceAfterPaise: number;
    referenceType?: string;
    referenceId?: string;
    description: string;
    createdAt: string;
  }>;
}

export interface ReferralSummaryDto {
  code: string;
  shareUrl: string;
  referrerRewardPaise: number;
  refereeRewardPaise: number;
  stats: { invited: number; rewarded: number; pending: number; earnedPaise: number };
  referrals: Array<{
    id: string;
    code: string;
    referrerName: string;
    refereeName: string;
    status: string;
    referrerRewardPaise: number;
    refereeRewardPaise: number;
    rewardedAt?: string;
    createdAt: string;
  }>;
}

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
  readAt?: string;
  createdAt: string;
}

export interface SurplusBagDto {
  id: string;
  title: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantImageUrl?: string;
  restaurantCuisines: string[];
  restaurantRating: number;
  restaurantAddress: string;
  originalValuePaise: number;
  salePricePaise: number;
  quantityAvailable: number;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  discountPercent: number;
}

export interface MembershipOverviewDto {
  active: {
    id: string;
    planCode: string;
    planName: string;
    description: string;
    benefits: { freeDeliveryAbovePaise?: number };
    startsAt: string;
    endsAt: string;
    source: string;
  } | null;
  plans: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    pricePaise: number;
    durationDays: number;
    benefits: { freeDeliveryAbovePaise?: number };
  }>;
  deliveredOrders: number;
  ordersToGold: number;
  cashbackEarnedPaise: number;
}

export interface RiderVerificationDto {
  riderId: string;
  riderName: string;
  phone: string;
  vehicleType: string;
  vehicleNumber?: string;
  isApproved: boolean;
  isOnline: boolean;
  status: "PENDING" | "IN_REVIEW" | "VERIFIED" | "REJECTED" | "SUSPENDED";
  aadhaarLast4?: string;
  panVerified: boolean;
  dlVerified: boolean;
  backgroundCheckStatus: "PENDING" | "CLEAR" | "CONSIDER";
  trainingCompletedAt?: string;
  submittedAt?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  requiredDocs: string[];
  missingDocs: string[];
  documents: Array<{
    id: string;
    docType: string;
    fileUrl: string;
    status: "PENDING" | "VERIFIED" | "REJECTED";
    reviewNote?: string;
    reviewedAt?: string;
    createdAt: string;
  }>;
}

export interface AdminRiderVerificationRow {
  riderId: string;
  name: string;
  phone: string;
  vehicleType: string;
  isApproved: boolean;
  status: RiderVerificationDto["status"];
  submittedAt?: string;
  rejectionReason?: string;
  documentCount: number;
}

export interface OrderMessageDto {
  id: string;
  channel: "CUSTOMER_RIDER" | "CUSTOMER_MERCHANT";
  senderType: "CUSTOMER" | "RIDER" | "MERCHANT" | "SYSTEM";
  senderName?: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface OrderIssueDto {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  category: string;
  description?: string;
  itemsJson: string[];
  photosJson: string[];
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";
  resolution?: string;
  refundAmountPaise: number;
  walletCreditPaise: number;
  couponCode?: string;
  supportTicketId?: string;
  adminNote?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface DiningRestaurantDto {
  id: string;
  slug: string;
  name: string;
  cuisines: string[];
  rating: number;
  ratingCount: number;
  avgPriceForOnePaise: number;
  heroImageUrl?: string;
  addressText: string;
  latitude: number;
  longitude: number;
  pureVeg: boolean;
  isOpen: boolean;
  acceptsReservations: boolean;
  reservationSlotMinutes: number;
  reservationCapacityPerSlot: number;
  maxPartySize: number;
  diningDescription?: string;
  distanceMeters?: number;
}

export interface DiningAvailabilityDto {
  restaurant: DiningRestaurantDto;
  date: string;
  slots: Array<{ slot: string; capacityLeft: number; isAvailable: boolean }>;
}

export interface DiningReservationDto {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantAddress: string;
  restaurantImageUrl?: string;
  customerId: string;
  customerName: string;
  date: string;
  slot: string;
  partySize: number;
  occasion?: string;
  specialRequest?: string;
  status: "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  confirmationCode: string;
  createdAt: string;
  cancelledAt?: string;
}

export interface NotificationPreferencesDto {
  orderUpdates: boolean;
  offers: boolean;
  referrals: boolean;
  newsletter: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  updatedAt: string;
}

export interface SafetyContactDto {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  isPrimary: boolean;
  createdAt: string;
}

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
  language: string;
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

export interface RiderIncentive {
  id: string;
  code: string;
  title: string;
  description: string;
  targetDeliveries: number;
  progressDeliveries: number;
  rewardPaise: number;
  startsAt: string;
  endsAt: string;
  canClaim: boolean;
  claimedAt?: string;
}

export interface RiderShift {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  isBooked: boolean;
  canBook: boolean;
  canCancel: boolean;
}

export interface RiderRewardsOverview {
  incentives: RiderIncentive[];
  shifts: RiderShift[];
  deliveredToday: number;
  claimedBonusPaise: number;
}

export interface RiderInsurancePolicy {
  id: string;
  riderId: string;
  planCode: string;
  planName: string;
  coveragePaise: number;
  hospitalCashPaise: number;
  status: string;
  validFrom: string;
  validUntil: string;
}

export interface RiderInsuranceClaim {
  id: string;
  policyId: string;
  riderId: string;
  incidentType: string;
  incidentDate: string;
  description: string;
  claimedPaise: number;
  approvedPaise?: number;
  status: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
  riderName?: string;
  riderPhone?: string;
}

export interface RiderEquipment {
  id: string;
  riderId: string;
  itemType: string;
  size?: string;
  status: string;
  notes?: string;
  issuedAt: string;
  updatedAt: string;
  renewalDueAt?: string;
  replacementFeePaise?: number;
  replacementFeeDeducted?: boolean;
  renewalStatus?: "VALID" | "DUE_SOON" | "EXPIRED";
}

export interface MealPlan {
  id: string;
  name: string;
  skuType: "STANDARD_LUNCH" | "STANDARD_DINNER";
  totalMeals: number;
  pricePaise: number;
  validityDays: number;
  lateSkipFeePaise: number;
  autoScheduleDays: number[];
  slotWindow: string;
  kitchenId: string;
  kitchenName: string;
  kitchenSlug: string;
  clusterId?: string | null;
}

export interface MealPass {
  id: string;
  planId: string;
  planName: string;
  skuType: string;
  slotWindow: string;
  kitchenId: string;
  kitchenName: string;
  totalMeals: number;
  mealsRemaining: number;
  status: string;
  autoScheduleDays: number[];
  purchasedAt: string;
  expiresAt: string;
}

export interface Campus {
  id: string;
  name: string;
  isActive: boolean;
  dropPoints: Array<{ id: string; name: string; latitude: number; longitude: number }>;
  plans: Array<{
    id: string;
    name: string;
    skuType: string;
    totalMeals: number;
    pricePaise: number;
    validityDays: number;
    slotWindow: string;
    kitchenName: string;
  }>;
}

export interface ScheduledMealDelivery {
  id: string;
  passId: string;
  planName: string;
  skuType: string;
  kitchenName: string;
  deliveryDate: string;
  slotWindow: string;
  status: string;
  source: string;
  skipAt?: string;
  surplusListingId?: string;
}

export interface CorporateMembership {
  member: boolean;
  accountId?: string;
  companyName?: string;
  costCenterCode?: string;
  emailDomain?: string;
  dropPointName?: string;
  dailyAllowancePaise?: number;
  subsidyPercentageBp?: number;
  managementFeeBp?: number;
  creditLimitPaise?: number;
  unbilledBalancePaise?: number;
  usedTodayPaise?: number;
  ordersToday?: number;
  remainingAllowancePaise?: number;
}

export interface CorporateSplit {
  companyName: string;
  costCenterCode: string;
  orderTotalPaise: number;
  allowanceRemainingPaise: number;
  coveredPaise: number;
  overagePaise: number;
  managementFeePaise: number;
  corporateBilledPaise: number;
  employeePayablePaise: number;
}

export interface CorporateAdminAccount {
  id: string;
  companyName: string;
  gstin: string;
  billingAddress: string;
  dropPointId: string;
  dropPointName: string | null;
  dailyAllowancePerEmployeePaise: number;
  subsidyPercentageBp: number;
  corporateManagementFeeBp: number;
  creditLimitPaise: number;
  unbilledBalancePaise: number;
  employees: number;
  invoices: number;
  isActive: boolean;
  createdAt: string;
}

export interface CorporateDropPoint {
  id: string;
  clusterId: string;
  clusterName: string;
  name: string;
  latitude: number;
  longitude: number;
  captainFeePerBagPaise: number;
}

export interface GiftCard {
  id: string;
  code: string;
  purchaserId: string;
  recipientName: string;
  recipientContact?: string;
  message?: string;
  amountPaise: number;
  status: string;
  redeemedBy?: string;
  redeemedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface Donation {
  id: string;
  amountPaise: number;
  fund: string;
  receiptCode: string;
  status: string;
  createdAt: string;
}

export interface PersonalizedFeed {
  affinity: Array<{ cuisine: string; orders: number; lastOrderedAt: string }>;
  reorder: RestaurantSummaryDto[];
  recommended: RestaurantSummaryDto[];
  headline: string;
}

export interface AddonUpsellSku {
  id: string;
  name: string;
  pricePaise: number;
  stockCount: number;
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

export interface SponsorshipState {
  active: boolean;
  endsAt?: string;
  daysRemaining?: number;
  dailyRatePaise: number;
  totalSpentPaise: number;
  maxDailyBudgetPaise?: number;
  bidPerClickPaise?: number;
}

export interface SponsorshipAnalytics {
  totalImpressions: number;
  totalClicks: number;
  ctrPercent: number;
  conversions: number;
  conversionRatePercent: number;
  totalSalesPaise: number;
  spendPaise: number;
  roas: number;
  maxDailyBudgetPaise: number;
  bidPerClickPaise: number;
  dailyBreakdown: Array<{
    date: string;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
}

export interface BillSplitShare {
  id: string;
  shareIndex: number;
  amountPaise: number;
  status: "PENDING" | "PAID";
  payerId?: string;
  payerName?: string;
  paidAt?: string;
}

export interface BillSplit {
  id: string;
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  hostId: string;
  hostName: string;
  token: string;
  parts: number;
  totalPaise: number;
  status: string;
  shares: BillSplitShare[];
  createdAt: string;
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

export interface MerchantCouponDto {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FLAT" | "FREE_DELIVERY";
  discountValue: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  isActive: boolean;
  description: string | null;
  validFrom: string | null;
  validUntil: string | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  firstOrderOnly: boolean;
  restaurantId: string;
  fundedBy?: "PLATFORM" | "MERCHANT";
  redeemedCount: number;
  reservedCount: number;
  fundedSpendPaise: number;
  attributedOrders: number;
  attributedRevenuePaise: number;
  createdAt: string;
}

export interface MerchantSurplusListing {
  id: string;
  title: string;
  originalValuePaise: number;
  salePricePaise: number;
  platformFlatFeePaise: number;
  quantityAvailable: number;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  status: string;
  soldCount: number;
  createdAt: string;
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
    amenities: string[];
    gallery: string[];
    hygieneRating: number | null;
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

export interface AdminJobRow {
  id: string;
  kind: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  runAt: string;
  lastError?: string;
  updatedAt: string;
}

export interface AdminAuditRow {
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  adminName: string;
  createdAt: string;
}

export interface AdminClusterRow {
  id: string;
  cityId: string;
  name: string;
  minProfitableDrops: number;
  isActive: boolean;
  dropPoints: number;
  batches: number;
  createdAt: string;
}

export interface AdminZoneDropPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  captainFeePerBagPaise: number;
}

export interface AdminZone extends Omit<AdminClusterRow, "dropPoints"> {
  dropPoints: AdminZoneDropPoint[];
}

export interface BatchCandidate {
  slotWindow: string;
  orders: number;
  drops: number;
  firstOrderAt: string;
  lastCutoffAt: string | null;
}

export interface DispatchBatchRow {
  id: string;
  clusterId: string;
  slotWindow: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  riderId: string | null;
  riderName: string | null;
  totalDrops: number;
  orderCount: number;
  createdAt: string;
}

export interface AdminOperations {
  stats: Array<{ kind: string; status: string; count: number }>;
  jobs: AdminJobRow[];
  failedJobs: AdminJobRow[];
  audits: AdminAuditRow[];
  clusters: AdminClusterRow[];
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

  async updateLanguage(language: "en" | "hi"): Promise<{ language: string }> {
    return this.request("/api/v1/me/language", { method: "PATCH", body: JSON.stringify({ language }) });
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

  async getPersonalizedFeed(location?: Coordinate): Promise<PersonalizedFeed> {
    return this.request<PersonalizedFeed>(
      `/api/v1/feed/personalized${qs({ latitude: location?.latitude, longitude: location?.longitude })}`
    );
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

  async tipOrder(orderId: string, amountPaise: number): Promise<{ id: string; amountPaise: number; createdAt: string }> {
    return this.request(`/api/v1/orders/${orderId}/tip`, { method: "POST", body: JSON.stringify({ amountPaise }) });
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

  async merchantHandoverPickup(orderId: string, pickupCode: string): Promise<void> {
    await this.request(`/api/v1/merchant/orders/${orderId}/handover`, {
      method: "POST",
      body: JSON.stringify({ pickupCode }),
    });
  }

  async getMerchantReviews(restaurantId: string): Promise<RestaurantReviewDto[]> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/reviews`);
  }

  async replyToReview(restaurantId: string, ratingId: string, reply: string): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/reviews/${ratingId}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    });
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

  async getAdminOperations(): Promise<AdminOperations> {
    return this.request("/api/v1/admin/operations");
  }

  async getAdminZones(): Promise<{ zones: AdminZone[]; cities: Array<{ id: string; name: string; slug: string }> }> {
    return this.request("/api/v1/admin/zones");
  }

  async getAdminPlatformConfig(): Promise<{
    settings: Record<string, any>;
    entries: Array<{ key: string; value: any; description?: string; updatedAt: string }>;
  }> {
    return this.request("/api/v1/admin/config");
  }

  async updateAdminPlatformConfig(
    settings: Record<string, any>
  ): Promise<{ settings: Record<string, any> }> {
    return this.request("/api/v1/admin/config", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    });
  }

  async createAdminZone(input: {
    name: string;
    cityId: string;
    centerLatitude: number;
    centerLongitude: number;
    radiusMeters?: number;
    polygon?: Array<{ latitude: number; longitude: number }>;
  }): Promise<{ zone: { id: string; name: string } }> {
    return this.request("/api/v1/admin/zones", { method: "POST", body: JSON.stringify(input) });
  }

  async setAdminZoneActive(zoneId: string, isActive: boolean): Promise<void> {
    await this.request(`/api/v1/admin/zones/${zoneId}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
  }

  async createAdminDropPoint(
    zoneId: string,
    input: { name: string; latitude: number; longitude: number }
  ): Promise<{ dropPoint: { id: string; name: string } }> {
    return this.request(`/api/v1/admin/zones/${zoneId}/drop-points`, { method: "POST", body: JSON.stringify(input) });
  }

  async getZoneBatches(zoneId: string): Promise<{ candidates: BatchCandidate[]; batches: DispatchBatchRow[] }> {
    return this.request(`/api/v1/admin/zones/${zoneId}/batches`);
  }

  async lockZoneBatch(
    zoneId: string,
    input: { slotWindow: string; slotStart: string; slotEnd: string; riderId?: string }
  ): Promise<{ batchId: string; status: string; totalDrops: number; orders: number }> {
    return this.request(`/api/v1/admin/zones/${zoneId}/batches/lock`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async assignBatchRider(zoneId: string, batchId: string, riderId: string | null): Promise<{ riderId: string | null }> {
    return this.request(`/api/v1/admin/zones/${zoneId}/batches/${batchId}`, {
      method: "PATCH",
      body: JSON.stringify({ riderId }),
    });
  }

  async retryAdminJob(jobId: string): Promise<void> {
    await this.request(`/api/v1/admin/jobs/${jobId}/retry`, { method: "POST" });
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

  async getSponsorship(restaurantId: string): Promise<SponsorshipState> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/sponsorship`);
  }

  async getSponsorshipAnalytics(restaurantId: string): Promise<SponsorshipAnalytics> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/sponsorship/analytics`);
  }

  async updateSponsorshipCampaign(
    restaurantId: string,
    input: { maxDailyBudgetPaise?: number; bidPerClickPaise?: number }
  ): Promise<{ state: SponsorshipState }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/sponsorship`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async recordSponsorshipEvent(input: {
    restaurantId: string;
    eventType: "IMPRESSION" | "CLICK" | "CONVERSION";
    source?: "SEARCH" | "HOME_FEED" | "COLLECTION" | "CUISINE_RAIL";
    orderId?: string;
    orderAmountPaise?: number;
  }): Promise<{ recorded: boolean }> {
    return this.request(`/api/v1/sponsorship/events`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async purchaseSponsorship(restaurantId: string, days: 3 | 7 | 14): Promise<{ sponsorship: { id: string; endsAt: string; amountPaise: number } }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/sponsorship`, {
      method: "POST",
      body: JSON.stringify({ days }),
    });
  }

  async getOrderSplit(orderId: string): Promise<{ split: BillSplit | null }> {
    return this.request(`/api/v1/orders/${orderId}/split`);
  }

  async createOrderSplit(orderId: string, parts: number): Promise<{ split: BillSplit }> {
    return this.request(`/api/v1/orders/${orderId}/split`, { method: "POST", body: JSON.stringify({ parts }) });
  }

  async getSharedSplit(token: string): Promise<{ split: BillSplit }> {
    return this.request(`/api/v1/splits/${token}`);
  }

  async paySharedSplit(token: string): Promise<{ split: BillSplit; paidShare: BillSplitShare }> {
    return this.request(`/api/v1/splits/${token}`, { method: "POST" });
  }

  async getMerchantCoupons(restaurantId: string): Promise<MerchantCouponDto[]> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/coupons`);
  }

  async createMerchantCoupon(restaurantId: string, input: MerchantCouponInput): Promise<MerchantCouponDto> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/coupons`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async setMerchantCouponActive(restaurantId: string, couponId: string, isActive: boolean): Promise<MerchantCouponDto> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/coupons/${couponId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  }

  async getMerchantSurplus(restaurantId: string): Promise<{ listings: MerchantSurplusListing[] }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/surplus`);
  }

  async createMerchantSurplus(
    restaurantId: string,
    input: {
      title: string;
      originalValuePaise: number;
      discountBp: number;
      platformFlatFeePaise: number;
      quantity: number;
      pickupWindowStart: string;
      pickupWindowEnd: string;
    }
  ): Promise<{ listing: MerchantSurplusListing }> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/surplus`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async setMerchantSurplusStatus(restaurantId: string, listingId: string, status: "ACTIVE" | "CANCELLED"): Promise<void> {
    await this.request(`/api/v1/merchant/restaurants/${restaurantId}/surplus/${listingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
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

  async getRiderRewards(): Promise<RiderRewardsOverview> {
    return this.request("/api/v1/rider/rewards");
  }

  async claimRiderIncentive(incentiveId: string): Promise<{ claimId: string; rewardPaise: number }> {
    return this.request(`/api/v1/rider/rewards/incentives/${incentiveId}/claim`, { method: "POST" });
  }

  async bookRiderShift(shiftId: string): Promise<{ bookingId: string }> {
    return this.request(`/api/v1/rider/rewards/shifts/${shiftId}/book`, { method: "POST" });
  }

  async cancelRiderShift(shiftId: string): Promise<void> {
    await this.request(`/api/v1/rider/rewards/shifts/${shiftId}/cancel`, { method: "POST" });
  }

  async getRiderInsurance(): Promise<{ policy: RiderInsurancePolicy | null; claims: RiderInsuranceClaim[] }> {
    return this.request("/api/v1/rider/insurance");
  }

  async enrollRiderInsurance(): Promise<{ policy: RiderInsurancePolicy }> {
    return this.request("/api/v1/rider/insurance", { method: "POST" });
  }

  async fileInsuranceClaim(input: {
    incidentType: "ACCIDENT" | "HOSPITALIZATION" | "VEHICLE_DAMAGE" | "OTHER";
    incidentDate: string;
    description: string;
    claimedPaise: number;
  }): Promise<{ claim: RiderInsuranceClaim }> {
    return this.request("/api/v1/rider/insurance/claims", { method: "POST", body: JSON.stringify(input) });
  }

  async getAdminInsuranceClaims(status?: string): Promise<{ claims: RiderInsuranceClaim[] }> {
    return this.request(`/api/v1/admin/insurance/claims${qs({ status })}`);
  }

  async getRiderEquipment(): Promise<{ equipment: RiderEquipment[] }> {
    return this.request("/api/v1/rider/equipment");
  }

  async issueRiderEquipment(input: {
    riderId: string;
    itemType: "HELMET" | "DELIVERY_BAG" | "T_SHIRT" | "INSURANCE_CARD";
    size?: string;
    notes?: string;
  }): Promise<{ equipment: RiderEquipment }> {
    return this.request("/api/v1/admin/rider-equipment", { method: "POST", body: JSON.stringify(input) });
  }

  async getRiderEquipmentForAdmin(riderId: string): Promise<{ equipment: RiderEquipment[] }> {
    return this.request(`/api/v1/admin/rider-equipment/${riderId}`);
  }

  async updateRiderEquipmentStatus(
    riderId: string,
    itemType: "HELMET" | "DELIVERY_BAG" | "T_SHIRT" | "INSURANCE_CARD",
    status: "RETURNED" | "LOST" | "RENEWED",
    chargeRider?: boolean
  ): Promise<{ equipment: RiderEquipment }> {
    return this.request(`/api/v1/admin/rider-equipment/${riderId}`, {
      method: "PATCH",
      body: JSON.stringify({ itemType, status, chargeRider }),
    });
  }

  async requestRiderEquipmentRenewal(
    itemType: "HELMET" | "DELIVERY_BAG" | "T_SHIRT" | "INSURANCE_CARD"
  ): Promise<{ equipment: RiderEquipment; scheduled: boolean }> {
    return this.request("/api/v1/rider/equipment", {
      method: "POST",
      body: JSON.stringify({ itemType }),
    });
  }

  async reviewInsuranceClaim(
    claimId: string,
    input: { status: "APPROVED" | "REJECTED"; approvedPaise?: number; note?: string }
  ): Promise<{ claim: RiderInsuranceClaim }> {
    return this.request(`/api/v1/admin/insurance/claims/${claimId}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getMealPlans(): Promise<{ plans: MealPlan[] }> {
    return this.request("/api/v1/meal-pass/plans");
  }

  async getCampuses(): Promise<{ campuses: Campus[] }> {
    return this.request("/api/v1/campus");
  }

  async getMealPasses(): Promise<{ passes: MealPass[] }> {
    return this.request("/api/v1/meal-pass/passes");
  }

  async getMealDeliveries(): Promise<{ deliveries: ScheduledMealDelivery[] }> {
    return this.request("/api/v1/meal-pass/deliveries");
  }

  async purchaseMealPass(planId: string, dropPointId?: string): Promise<{
    pass: { id: string; planId: string; mealsRemaining: number; status: string; expiresAt: string };
    plan: { id: string; name: string; totalMeals: number };
    scheduledDeliveries: number;
    paymentMethod: string;
  }> {
    return this.request("/api/v1/meal-pass/passes", { method: "POST", body: JSON.stringify({ planId, dropPointId }) });
  }

  async skipMealDelivery(deliveryId: string): Promise<{ status: string; surplusListingId?: string; mealsRemaining: number }> {
    return this.request(`/api/v1/meal-pass/deliveries/${deliveryId}/skip`, { method: "POST" });
  }

  async getCorporateMembership(): Promise<CorporateMembership> {
    return this.request("/api/v1/corporate/me");
  }

  async getCorporateSplit(accountId: string, orderTotalPaise: number): Promise<CorporateSplit> {
    return this.request(`/api/v1/corporate/split${qs({ accountId, orderTotalPaise })}`);
  }

  async createCorporateOrder(quoteId: string, corporateAccountId: string): Promise<{
    orderId: string;
    orderNumber: string;
    payablePaise: number;
    corporateCoveredPaise: number;
    corporateBilledPaise: number;
    managementFeePaise: number;
    paymentMethod: string;
  }> {
    return this.request("/api/v1/corporate/checkout", {
      method: "POST",
      body: JSON.stringify({ quoteId, corporateAccountId }),
    });
  }

  async getCorporateAccounts(): Promise<{ accounts: CorporateAdminAccount[] }> {
    return this.request("/api/v1/admin/corporate/accounts");
  }

  async getCorporateDropPoints(): Promise<{ dropPoints: CorporateDropPoint[] }> {
    return this.request("/api/v1/admin/corporate/drop-points");
  }

  async createCorporateAccount(input: {
    companyName: string;
    gstin: string;
    billingAddress: string;
    dropPointId: string;
    dailyAllowancePerEmployeePaise: number;
    subsidyPercentageBp?: number;
    corporateManagementFeeBp?: number;
    creditLimitPaise?: number;
  }): Promise<{ account: { id: string } }> {
    return this.request("/api/v1/admin/corporate/accounts", { method: "POST", body: JSON.stringify(input) });
  }

  async addCorporateEmployee(
    accountId: string,
    input: { email: string; costCenterCode: string; emailDomain?: string }
  ): Promise<{ employee: { id: string } }> {
    return this.request(`/api/v1/admin/corporate/accounts/${accountId}/employees`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async generateCorporateInvoice(accountId: string, month?: string): Promise<{ invoice: { invoice_number: string; total_paise: number } }> {
    return this.request(`/api/v1/admin/corporate/accounts/${accountId}/invoices`, {
      method: "POST",
      body: JSON.stringify({ month }),
    });
  }

  async getGiftCards(): Promise<{ cards: GiftCard[] }> {
    return this.request("/api/v1/gift-cards");
  }

  async purchaseGiftCard(input: {
    amountPaise: number;
    recipientName: string;
    recipientContact?: string;
    message?: string;
  }): Promise<{ card: GiftCard }> {
    return this.request("/api/v1/gift-cards", { method: "POST", body: JSON.stringify(input) });
  }

  async redeemGiftCard(code: string): Promise<{ card: GiftCard; balancePaise: number }> {
    return this.request("/api/v1/gift-cards/redeem", { method: "POST", body: JSON.stringify({ code }) });
  }

  async getDonations(): Promise<{ totalPaise: number; donations: Donation[] }> {
    return this.request("/api/v1/donations");
  }

  async giveDonation(amountPaise: number): Promise<{ donation: Donation }> {
    return this.request("/api/v1/donations", { method: "POST", body: JSON.stringify({ amountPaise }) });
  }

  async getAddonUpsell(parentOrderId: string): Promise<{ parentOrderId: string; skus: AddonUpsellSku[] }> {
    return this.request(`/api/v1/addons/upsell${qs({ parentOrderId })}`);
  }

  async addOneTapAddon(parentOrderId: string, addonSkuId: string, quantity?: number): Promise<{
    orderId: string;
    orderNumber: string;
    bagLabel: string;
    payablePaise: number;
    paymentMethod: string;
  }> {
    return this.request("/api/v1/addons", {
      method: "POST",
      body: JSON.stringify({ parentOrderId, addonSkuId, quantity }),
    });
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

  // 13. Wallet, referrals and rider KYC
  async getWallet(): Promise<WalletSummaryDto> {
    return this.request("/api/v1/wallet");
  }

  async getReferrals(): Promise<ReferralSummaryDto> {
    return this.request("/api/v1/referrals");
  }

  async getSurplusBags(): Promise<SurplusBagDto[]> {
    const res = await this.request<{ listings: SurplusBagDto[] }>("/api/v1/surplus");
    return res.listings;
  }

  async purchaseSurplusBag(listingId: string): Promise<{
    orderId: string;
    orderNumber: string;
    payablePaise: number;
    listingId: string;
    restoredPassCredit: boolean;
    paymentMethod: string;
  }> {
    return this.request(`/api/v1/surplus/${listingId}/purchase`, { method: "POST", body: JSON.stringify({}) });
  }

  async getMembership(): Promise<MembershipOverviewDto> {
    return this.request("/api/v1/membership");
  }

  async purchaseMembership(planId: string): Promise<{
    purchaseId: string;
    razorpayOrderId: string;
    razorpayKeyId: string;
    amountPaise: number;
    simulatedPayment: boolean;
  }> {
    return this.request("/api/v1/membership/purchase", { method: "POST", body: JSON.stringify({ planId }) });
  }

  async verifyMembershipPayment(input: {
    purchaseId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<{ success: boolean; alreadyProcessed: boolean; membership: MembershipOverviewDto["active"] }> {
    return this.request("/api/v1/membership/verify", { method: "POST", body: JSON.stringify(input) });
  }

  async getNotifications(limit = 30): Promise<{ notifications: NotificationDto[]; unreadCount: number }> {
    return this.request(`/api/v1/notifications${qs({ limit })}`);
  }

  async markNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
    return this.request("/api/v1/notifications/read", { method: "POST", body: JSON.stringify({ ids }) });
  }

  async applyReferralCode(code: string): Promise<ReferralSummaryDto["referrals"][number]> {
    return this.request("/api/v1/referrals/apply", { method: "POST", body: JSON.stringify({ code }) });
  }

  async getRiderVerification(): Promise<RiderVerificationDto> {
    return this.request("/api/v1/rider/verification");
  }

  async uploadRiderDocument(file: Blob): Promise<{ url: string; storage?: string }> {
    return this.request("/api/v1/rider/verification/upload", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
  }

  async registerRiderDocument(docType: string, fileUrl: string): Promise<RiderVerificationDto> {
    return this.request("/api/v1/rider/verification", { method: "POST", body: JSON.stringify({ docType, fileUrl }) });
  }

  async submitRiderVerification(aadhaarLast4: string): Promise<RiderVerificationDto> {
    return this.request("/api/v1/rider/verification/submit", {
      method: "POST",
      body: JSON.stringify({ aadhaarLast4, consentBackgroundCheck: true }),
    });
  }

  async getAdminRiderVerifications(status?: RiderVerificationDto["status"]): Promise<AdminRiderVerificationRow[]> {
    return this.request(`/api/v1/admin/rider-verifications${qs({ status })}`);
  }

  async getAdminRiderVerification(riderId: string): Promise<RiderVerificationDto> {
    return this.request(`/api/v1/admin/rider-verifications/${riderId}`);
  }

  async reviewRiderVerification(riderId: string, decision: "APPROVE" | "REJECT" | "SUSPEND", note: string): Promise<RiderVerificationDto> {
    return this.request(`/api/v1/admin/rider-verifications/${riderId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
  }

  async getAdminReferrals(): Promise<ReferralSummaryDto["referrals"]> {
    return this.request("/api/v1/admin/referrals");
  }

  // 14. In-order chat, delivery proof and problems
  async getOrderMessages(orderId: string, channel: "CUSTOMER_RIDER" | "CUSTOMER_MERCHANT"): Promise<OrderMessageDto[]> {
    const res = await this.request<{ messages: OrderMessageDto[] }>(`/api/v1/orders/${orderId}/messages${qs({ channel })}`);
    return res.messages;
  }

  async sendOrderMessage(orderId: string, channel: "CUSTOMER_RIDER" | "CUSTOMER_MERCHANT", body: string): Promise<OrderMessageDto> {
    return this.request(`/api/v1/orders/${orderId}/messages`, { method: "POST", body: JSON.stringify({ channel, body }) });
  }

  async getOrderIssues(orderId: string): Promise<OrderIssueDto[]> {
    return this.request(`/api/v1/orders/${orderId}/issues`);
  }

  async createOrderIssue(
    orderId: string,
    input: { category: string; description: string; itemIds: string[]; photos?: string[] }
  ): Promise<OrderIssueDto> {
    return this.request(`/api/v1/orders/${orderId}/issues`, {
      method: "POST",
      body: JSON.stringify({ ...input, photos: input.photos ?? [] }),
    });
  }

  async getSearchSuggestions(q: string): Promise<Array<{ text: string; type: "restaurant" | "dish" | "cuisine"; targetId?: string; targetSlug?: string }>> {
    return this.request(`/api/v1/search/suggestions${qs({ q })}`);
  }

  async getOrderProof(orderId: string): Promise<{ photoUrl?: string; latitude?: number; longitude?: number; note?: string; createdAt: string } | null> {
    return this.request(`/api/v1/orders/${orderId}/proof`);
  }

  async shareOrder(orderId: string): Promise<{ url: string; token: string; expiresAt: string }> {
    return this.request(`/api/v1/orders/${orderId}/share`, { method: "POST" });
  }

  async uploadImage(file: Blob): Promise<{ url: string; storage?: string }> {
    return this.request("/api/v1/uploads", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
  }

  async uploadProofImage(file: Blob): Promise<{ url: string; storage?: string }> {
    return this.uploadImage(file);
  }

  async saveDeliveryProof(
    orderId: string,
    input: { photoUrl?: string; latitude?: number; longitude?: number; note?: string }
  ): Promise<{ id: string; photoUrl?: string }> {
    return this.request(`/api/v1/rider/trip/proof${qs({ orderId })}`, { method: "POST", body: JSON.stringify(input) });
  }

  async getAdminIssues(status?: OrderIssueDto["status"]): Promise<OrderIssueDto[]> {
    return this.request(`/api/v1/admin/issues${qs({ status })}`);
  }

  async resolveOrderIssue(
    issueId: string,
    input: { resolution: string; walletCreditPaise?: number; refundAmountPaise?: number; couponCode?: string; note: string }
  ): Promise<OrderIssueDto> {
    return this.request(`/api/v1/admin/issues/${issueId}/resolve`, { method: "POST", body: JSON.stringify(input) });
  }

  // 15. Dining out
  async getDiningRestaurants(params: { latitude?: number; longitude?: number; cuisine?: string } = {}): Promise<DiningRestaurantDto[]> {
    return this.request(`/api/v1/dining/restaurants${qs(params)}`);
  }

  async getDiningAvailability(restaurantId: string, date?: string): Promise<DiningAvailabilityDto> {
    return this.request(`/api/v1/dining/restaurants/${restaurantId}${qs({ date })}`);
  }

  async createDiningReservation(input: {
    restaurantId: string;
    date: string;
    slot: string;
    partySize: number;
    occasion?: string;
    specialRequest?: string;
  }): Promise<DiningReservationDto> {
    return this.request("/api/v1/dining/reservations", { method: "POST", body: JSON.stringify(input) });
  }

  async getMyDiningReservations(): Promise<DiningReservationDto[]> {
    return this.request("/api/v1/dining/reservations");
  }

  async cancelDiningReservation(reservationId: string): Promise<DiningReservationDto> {
    return this.request(`/api/v1/dining/reservations/${reservationId}`, { method: "DELETE" });
  }

  async getMerchantDining(restaurantId: string, date?: string): Promise<DiningReservationDto[]> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/dining${qs({ date })}`);
  }

  async updateDiningStatus(restaurantId: string, reservationId: string, status: DiningReservationDto["status"]): Promise<DiningReservationDto> {
    return this.request(`/api/v1/merchant/restaurants/${restaurantId}/dining/${reservationId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  }

  // 16. Notification preferences and safety
  async getNotificationPreferences(): Promise<NotificationPreferencesDto> {
    return this.request("/api/v1/me/notifications");
  }

  async updateNotificationPreferences(patch: Partial<NotificationPreferencesDto>): Promise<NotificationPreferencesDto> {
    return this.request("/api/v1/me/notifications", { method: "PATCH", body: JSON.stringify(patch) });
  }

  async getSafetyContacts(): Promise<SafetyContactDto[]> {
    return this.request("/api/v1/me/safety-contacts");
  }

  async addSafetyContact(input: { name: string; phone: string; relationship?: string; isPrimary?: boolean }): Promise<SafetyContactDto> {
    return this.request("/api/v1/me/safety-contacts", {
      method: "POST",
      body: JSON.stringify({ isPrimary: false, ...input }),
    });
  }

  async deleteSafetyContact(contactId: string): Promise<void> {
    await this.request(`/api/v1/me/safety-contacts/${contactId}`, { method: "DELETE" });
  }

  async createSafetyEvent(input: {
    eventType: "SOS" | "TRACKING_SHARED" | "DELIVERY_CONCERN";
    orderId?: string;
    latitude?: number;
    longitude?: number;
    note?: string;
  }): Promise<{ id: string; eventType: string; status: string; createdAt: string }> {
    return this.request("/api/v1/safety/events", { method: "POST", body: JSON.stringify(input) });
  }

  // 17. Group ordering
  async createGroupCart(restaurantId: string): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>("/api/v1/group-carts", {
      method: "POST",
      body: JSON.stringify({ restaurantId }),
    });
    return data.groupCart;
  }

  async getGroupCart(code: string): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}`
    );
    return data.groupCart;
  }

  async addGroupCartItem(
    code: string,
    input: { menuItemId: string; variantId?: string; selectedOptionIds?: string[]; quantity: number; notes?: string }
  ): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}/items`,
      { method: "POST", body: JSON.stringify(input) }
    );
    return data.groupCart;
  }

  async updateGroupCartItem(code: string, itemId: string, quantity: number): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}/items/${itemId}`,
      { method: "PATCH", body: JSON.stringify({ quantity }) }
    );
    return data.groupCart;
  }

  async removeGroupCartItem(code: string, itemId: string): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}/items/${itemId}`,
      { method: "DELETE" }
    );
    return data.groupCart;
  }

  async lockGroupCart(code: string): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}/lock`,
      { method: "POST" }
    );
    return data.groupCart;
  }

  async reopenGroupCart(code: string): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}/reopen`,
      { method: "POST" }
    );
    return data.groupCart;
  }

  async completeGroupCart(code: string, orderId: string): Promise<GroupCartDto> {
    const data = await this.request<{ groupCart: GroupCartDto }>(
      `/api/v1/group-carts/${encodeURIComponent(code)}/complete`,
      { method: "POST", body: JSON.stringify({ orderId }) }
    );
    return data.groupCart;
  }

  // 18. Dining events / Zomato Live
  async getDiningEvents(): Promise<DiningEventDto[]> {
    const data = await this.request<{ events: DiningEventDto[] }>("/api/v1/events");
    return data.events;
  }

  async getDiningEvent(eventId: string): Promise<DiningEventDto> {
    const data = await this.request<{ event: DiningEventDto }>(`/api/v1/events/${eventId}`);
    return data.event;
  }

  async getDiningEventBookings(): Promise<DiningEventBookingDto[]> {
    const data = await this.request<{ bookings: DiningEventBookingDto[] }>("/api/v1/events/bookings");
    return data.bookings;
  }

  async bookDiningEvent(eventId: string, quantity: number): Promise<DiningEventBookingDto> {
    const data = await this.request<{ booking: DiningEventBookingDto }>(
      `/api/v1/events/${eventId}/book`,
      { method: "POST", body: JSON.stringify({ quantity }) }
    );
    return data.booking;
  }

  async cancelDiningEventBooking(bookingId: string): Promise<DiningEventBookingDto> {
    const data = await this.request<{ booking: DiningEventBookingDto }>(
      `/api/v1/events/bookings/${bookingId}/cancel`,
      { method: "POST" }
    );
    return data.booking;
  }

  // 19. Curated collections
  async getCollections(): Promise<CollectionSummaryDto[]> {
    const data = await this.request<{ collections: CollectionSummaryDto[] }>("/api/v1/collections");
    return data.collections;
  }

  async getCollection(slug: string): Promise<CollectionDetailDto> {
    const data = await this.request<{ collection: CollectionDetailDto }>(
      `/api/v1/collections/${encodeURIComponent(slug)}`
    );
    return data.collection;
  }
}

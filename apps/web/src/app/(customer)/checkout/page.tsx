"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Bike,
  Briefcase,
  Check,
  ChevronRight,
  Clock,
  Crown,
  DoorClosed,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { CheckoutResponse, PaymentMethod } from "@startup/contracts";
import { ApiError } from "@startup/api-client";
import { GROUP_ORDER_CODE_KEY, useCartStore } from "@/features/cart/cart-store";
import { useCartHydrated } from "@/features/hydration";
import { useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { LocationSheet } from "@/components/location/location-sheet";
import { Modal } from "@/components/ui/modal";
import { PhoneInput, Toggle } from "@/components/ui/field";
import { EmptyState, PageSpinner, Spinner, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/features/i18n/use-i18n";
import { errorMessage, useApi, useMe } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { openRazorpayCheckout } from "@/lib/razorpay";

const TIP_OPTIONS = [0, 2000, 3000, 5000];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="py-8 first:pt-0">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const cart = useCartStore();
  const cartReady = useCartHydrated();
  const { isSignedIn, isLoaded } = useAuth();
  const me = useMe();
  const { addressId, setAddress } = useLocationStore();
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [paying, setPaying] = useState(false);
  const [simulated, setSimulated] = useState<CheckoutResponse | null>(null);
  // Set once payment succeeds so the emptied cart doesn't flash "your cart is empty" before navigation
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.RAZORPAY);
  const [useCorporate, setUseCorporate] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [schedule, setSchedule] = useState<"NOW" | "LATER">("NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [contactless, setContactless] = useState(false);
  const [cutleryOptIn, setCutleryOptIn] = useState(true);
  const [deliveryPreference, setDeliveryPreference] = useState("DOOR");
  const [gifting, setGifting] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  useEffect(() => {
    if (fulfillmentMode === "PICKUP" || schedule !== "NOW" || gifting) setUseCorporate(false);
  }, [fulfillmentMode, schedule, gifting]);

  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => api.getAddresses(), enabled: isSignedIn });
  const coupons = useQuery({
    queryKey: ["coupons", cart.restaurantId],
    queryFn: () => api.getAvailableCoupons(cart.restaurantId ?? undefined),
    enabled: !!cart.restaurantId,
  });
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => api.getWallet(), enabled: isSignedIn });
  const corporate = useQuery({ queryKey: ["corporate-membership"], queryFn: () => api.getCorporateMembership(), enabled: isSignedIn });
  const corporateActive = useCorporate && fulfillmentMode !== "PICKUP" && !!corporate.data?.member;
  const pickupRestaurant = useQuery({
    queryKey: ["checkout-restaurant", cart.restaurantSlug],
    queryFn: () => api.getRestaurantBySlug(cart.restaurantSlug!),
    enabled: fulfillmentMode === "PICKUP" && !!cart.restaurantSlug,
    staleTime: 60_000,
  });

  // Fall back to the default saved address when the chosen location is only a map pin
  const selectedAddress = useMemo(() => {
    const list = addresses.data ?? [];
    return list.find((a) => a.id === addressId) ?? list.find((a) => a.isDefault) ?? list[0] ?? null;
  }, [addresses.data, addressId]);

  const quoteInput = useDebounced(
    {
      restaurantId: cart.restaurantId,
      addressId: fulfillmentMode === "DELIVERY" ? selectedAddress?.id : undefined,
      orderMode: fulfillmentMode,
      items: cart.items.map((i) => ({
        menuItemId: i.menuItemId,
        variantId: i.variantId,
        selectedOptionIds: i.selectedOptionIds,
        quantity: i.quantity,
        instructions: i.instructions,
      })),
      couponCode: cart.couponCode ?? undefined,
      tipPaise: fulfillmentMode === "DELIVERY" ? cart.tipPaise : 0,
      scheduledFor: schedule === "LATER" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      contactless: fulfillmentMode === "DELIVERY" && contactless,
      cutleryOptIn,
      deliveryPreference: fulfillmentMode === "DELIVERY" ? deliveryPreference : undefined,
    },
    350
  );

  const quote = useQuery({
    queryKey: ["quote", quoteInput],
    queryFn: () =>
      api.createQuote({
        restaurantId: quoteInput.restaurantId!,
        deliveryAddressId: quoteInput.addressId,
        orderMode: quoteInput.orderMode,
        items: quoteInput.items,
        couponCode: quoteInput.couponCode,
        tipPaise: quoteInput.tipPaise,
        scheduledFor: quoteInput.scheduledFor,
        contactless: quoteInput.contactless,
        cutleryOptIn: quoteInput.cutleryOptIn,
        deliveryPreference: quoteInput.deliveryPreference as
          | "DOOR"
          | "RECEPTION"
          | "SECURITY"
          | "HAND_ME"
          | undefined,
      }),
    enabled:
      isSignedIn &&
      !placedOrderId &&
      !!quoteInput.restaurantId &&
      (fulfillmentMode === "PICKUP" || !!quoteInput.addressId) &&
      quoteInput.items.length > 0,
    staleTime: 4 * 60_000,
    retry: false,
  });
  const corporateSplit = useQuery({
    queryKey: ["corporate-split", corporate.data?.accountId, quote.data?.breakdown.payablePaise],
    queryFn: () => api.getCorporateSplit(corporate.data!.accountId!, quote.data!.breakdown.payablePaise),
    enabled: corporateActive && !!quote.data?.breakdown && !!corporate.data?.accountId,
    staleTime: 10_000,
  });

  // A quote expires after 10 minutes; refresh it in the background before it does
  const { refetch: refetchQuote } = quote;
  useEffect(() => {
    if (!quote.data) return;
    const msLeft = new Date(quote.data.expiresAt).getTime() - Date.now() - 30_000;
    const t = setTimeout(() => refetchQuote(), Math.max(5_000, msLeft));
    return () => clearTimeout(t);
  }, [quote.data, refetchQuote]);

  // One idempotency key per priced quote: double taps and retries never create two orders
  const idempotencyKey = useMemo(
    () => (quote.data ? `chk_${quote.data.quoteId}_${Math.random().toString(36).slice(2, 10)}` : null),
    [quote.data]
  );
  const payingRef = useRef(false);

  if (placedOrderId) {
    return (
      <div className="page-narrow flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-7 w-7" />
        </span>
        <p className="mt-6 text-lg font-semibold text-ink">Order placed</p>
        <p className="mt-1 text-sm text-ink-muted">Taking you to live tracking…</p>
      </div>
    );
  }

  if (!cartReady) return <PageSpinner />;

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Your cart is empty"
        body="Add dishes from a restaurant near you to get started."
        action={
          <Link href="/" className="btn btn-primary">
            Browse restaurants
          </Link>
        }
      />
    );
  }

  if (isLoaded && !isSignedIn) {
    return (
      <EmptyState
        icon={<Lock />}
        title="Sign in to place your order"
        body="Your cart is saved on this device."
        action={
          <Link href="/sign-in?redirect_url=/checkout" className="btn btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }

  const quoteError = quote.error instanceof ApiError ? quote.error : null;
  const missingItemId = (quoteError?.details as { menuItemId?: string } | undefined)?.menuItemId;
  const breakdown = quote.data?.breakdown;
  const walletBalance = wallet.data?.account.balancePaise ?? 0;
  const isPickup = fulfillmentMode === "PICKUP";
  const corporateEmployeePayable = corporateSplit.data?.employeePayablePaise ?? 0;
  const corporateInsufficient = corporateActive && !!corporateSplit.data && walletBalance < corporateEmployeePayable;
  const lunchWindow = (() => {
    const ist = new Date(Date.now() + 330 * 60 * 1000);
    const day = ist.getUTCDay();
    return day >= 1 && day <= 5 && ist.getUTCHours() >= 11 && ist.getUTCHours() < 15;
  })();
  const walletInsufficient = !corporateActive && paymentMethod === PaymentMethod.WALLET && !!breakdown && walletBalance < breakdown.payablePaise;
  const codUnavailable = isPickup && paymentMethod === PaymentMethod.COD;
  const scheduleInvalid =
    schedule === "LATER" && (!scheduledAt || new Date(scheduledAt).getTime() < Date.now() + 15 * 60 * 1000);
  const giftInvalid = gifting && (recipientName.trim().length < 2 || recipientPhone.length !== 10);
  const canPay =
    !paying &&
    !!breakdown &&
    (isPickup || !!selectedAddress) &&
    !quote.isFetching &&
    !quoteError &&
    !walletInsufficient &&
    !codUnavailable &&
    !scheduleInvalid &&
    !giftInvalid &&
    (!useCorporate || lunchWindow) &&
    (!corporateActive || (!!corporateSplit.data && !corporateSplit.isFetching)) &&
    !corporateInsufficient;

  const closeGroupOrder = (orderId: string) => {
    const code = sessionStorage.getItem(GROUP_ORDER_CODE_KEY);
    if (!code) return;
    sessionStorage.removeItem(GROUP_ORDER_CODE_KEY);
    void api.completeGroupCart(code, orderId).catch(() => {
      // The order is already placed; a stale group link is harmless.
    });
  };

  const finishPayment = async (checkout: CheckoutResponse, payment: { paymentId: string; signature: string }) => {
    if (!checkout.razorpayOrderId) throw new Error("Missing payment order reference");
    const result = await api.verifyPayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: payment.paymentId,
      razorpaySignature: payment.signature,
    });
    setPlacedOrderId(checkout.orderId);
    cart.clearCart();
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    closeGroupOrder(checkout.orderId);
    if (result.status === "CONFIRMING") toast("Payment received. Confirming with your bank…");
    router.push(`/orders/${checkout.orderId}`);
  };

  const placeOrder = async () => {
    if (!quote.data || (!isPickup && !selectedAddress) || !idempotencyKey || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    try {
      if (corporateActive && corporate.data?.accountId && corporateSplit.data) {
        if (!lunchWindow) {
          toast("Corporate allowance is available on weekday lunches between 11am and 3pm IST.", "error");
          return;
        }
        const result = await api.createCorporateOrder(quote.data.quoteId, corporate.data.accountId);
        setPlacedOrderId(result.orderId);
        cart.clearCart();
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["wallet"] });
        queryClient.invalidateQueries({ queryKey: ["corporate-membership"] });
        toast(
          result.payablePaise > 0
            ? "Corporate allowance applied. Overage paid with BiteBox Credits."
            : "Corporate allowance applied. No payment needed.",
          "success"
        );
        closeGroupOrder(result.orderId);
        router.push(`/orders/${result.orderId}`);
        return;
      }
      const checkout = await api.createCheckout({
        quoteId: quote.data.quoteId,
        deliveryAddressId: isPickup ? undefined : selectedAddress!.id,
        instructions: cart.instructions || undefined,
        idempotencyKey,
        paymentMethod,
        recipientName: gifting ? recipientName.trim() : undefined,
        recipientPhone: gifting ? `+91${recipientPhone}` : undefined,
        giftMessage: gifting && giftMessage.trim() ? giftMessage.trim() : undefined,
      });

      if (!checkout.razorpayOrderId || !checkout.razorpayKeyId) {
        // Wallet / cash orders are already confirmed by the server
        setPlacedOrderId(checkout.orderId);
        cart.clearCart();
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["wallet"] });
        toast(
          paymentMethod === PaymentMethod.WALLET
            ? "Paid with BiteBox Credits."
            : "Order confirmed. Please pay cash when it arrives.",
          "success"
        );
        closeGroupOrder(checkout.orderId);
        router.push(`/orders/${checkout.orderId}`);
        return;
      }

      if (checkout.simulatedPayment) {
        setSimulated(checkout);
        return;
      }

      const result = await openRazorpayCheckout({
        keyId: checkout.razorpayKeyId,
        razorpayOrderId: checkout.razorpayOrderId,
        amountPaise: checkout.amountPaise,
        orderNumber: checkout.orderNumber,
        prefill: {
          name: me.data?.name,
          email: me.data?.email ?? undefined,
          contact: me.data?.phone ?? selectedAddress?.contactPhone,
        },
      });
      if (!result) {
        toast("Payment cancelled. Your cart is saved — you can try again.");
        return;
      }
      await finishPayment(checkout, { paymentId: result.razorpay_payment_id, signature: result.razorpay_signature });
    } catch (err) {
      if (err instanceof ApiError && err.code === "QUOTE_EXPIRED") {
        toast("Prices were updated. Please review your bill.", "info");
        quote.refetch();
      } else {
        toast(errorMessage(err), "error");
      }
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  const billRows: Array<[string, number]> = breakdown
    ? [
        ["Item total", breakdown.subtotalPaise],
        ["Delivery fee", breakdown.deliveryFeePaise + breakdown.surgePaise],
        ["Packaging", breakdown.packagingPaise],
        ["Platform fee", breakdown.platformFeePaise],
        ["GST & charges", breakdown.taxPaise],
        ...(breakdown.tipPaise ? [["Delivery partner tip", breakdown.tipPaise] as [string, number]] : []),
      ]
    : [];

  const displayPayable = corporateActive && corporateSplit.data ? corporateEmployeePayable : breakdown?.payablePaise ?? 0;
  const payLabel = corporateActive
    ? corporateEmployeePayable > 0
      ? "Pay overage with credits"
      : "Confirm with allowance"
    : paymentMethod === PaymentMethod.WALLET
      ? "Pay with credits"
      : paymentMethod === PaymentMethod.COD
        ? "Place COD order"
        : "Pay securely";
  const payButton = (
    <button onClick={placeOrder} disabled={!canPay} className="btn btn-primary btn-lg btn-block justify-between">
      <span className="flex items-center gap-2">
        {paying ? <Spinner /> : corporateActive ? <Briefcase className="h-4 w-4" /> : paymentMethod === PaymentMethod.COD ? <Banknote className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{" "}
        {paying ? "Processing…" : payLabel}
      </span>
      <span className="tabular">{breakdown ? formatRupees(displayPayable) : ""}</span>
    </button>
  );

  return (
    <div className="page pb-40 pt-8 sm:pt-12 lg:pb-16">
      <Link href={cart.restaurantSlug ? `/restaurants/${cart.restaurantSlug}` : "/"} className="btn btn-ghost btn-sm -ml-4 gap-1.5">
        <ArrowLeft className="h-4 w-4" /> {cart.restaurantName}
      </Link>
      <h1 className="h-page mt-4">Checkout</h1>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_400px] lg:gap-16">
        <div className="rows min-w-0">
          <Section title="How do you want your order?">
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Fulfillment method">
              <button
                role="radio"
                aria-checked={!isPickup}
                onClick={() => setFulfillmentMode("DELIVERY")}
                className={`rounded-2xl border p-4 text-left transition ${!isPickup ? "border-ink bg-white" : "border-line hover:border-line-strong"}`}
              >
                <Bike className="h-5 w-5 text-ink" />
                <span className="mt-3 block text-sm font-medium text-ink">Delivery</span>
                <span className="mt-0.5 block text-xs text-ink-muted">To your door in ~{quote.data?.estimatedMinMinutes ?? 30} min</span>
              </button>
              <button
                role="radio"
                aria-checked={isPickup}
                onClick={() => {
                  setFulfillmentMode("PICKUP");
                  setContactless(false);
                  setGifting(false);
                  if (paymentMethod === PaymentMethod.COD) setPaymentMethod(PaymentMethod.RAZORPAY);
                }}
                className={`rounded-2xl border p-4 text-left transition ${isPickup ? "border-ink bg-white" : "border-line hover:border-line-strong"}`}
              >
                <Store className="h-5 w-5 text-ink" />
                <span className="mt-3 block text-sm font-medium text-ink">Pickup</span>
                <span className="mt-0.5 block text-xs text-ink-muted">No delivery fee · skip the queue</span>
              </button>
            </div>
          </Section>

          <Section
            title={isPickup ? "Pickup from" : t("checkout.deliveryAddress")}
            action={
              isPickup ? undefined : (
                <button onClick={() => setAddressSheetOpen(true)} className="btn btn-ghost btn-sm -mr-4">
                  {selectedAddress ? "Change" : "Add"}
                </button>
              )
            }
          >
            {isPickup ? (
              pickupRestaurant.isPending ? (
                <div className="skeleton h-20" />
              ) : pickupRestaurant.data ? (
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle">
                    <Store className="h-5 w-5 text-ink" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{pickupRestaurant.data.name}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{pickupRestaurant.data.addressText}</p>
                    {pickupRestaurant.data.phone && <p className="mt-1 text-sm text-ink-muted">{pickupRestaurant.data.phone}</p>}
                    <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-xs text-ink-soft">
                      Show your pickup code at the counter. No delivery fee.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Restaurant address will appear here.</p>
              )
            ) : addresses.isPending ? (
              <div className="skeleton h-20" />
            ) : selectedAddress ? (
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle">
                  <MapPin className="h-5 w-5 text-ink" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink">{selectedAddress.label}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {selectedAddress.building}, {selectedAddress.street}
                  </p>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddressSheetOpen(true)} className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-line-strong p-5 text-left hover:border-ink">
                <Plus className="h-5 w-5 text-ink" />
                <span className="text-sm text-ink">Add a delivery address to see your final bill</span>
              </button>
            )}
            {!isPickup && (addresses.data?.length ?? 0) > 1 && (
              <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                {addresses.data!.map((a) => (
                  <button key={a.id} onClick={() => setAddress(a)} aria-pressed={a.id === selectedAddress?.id} className="chip">
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {!isPickup && (
            <Section title="Who is this for?">
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-subtle p-5">
                <span className="text-sm text-ink">
                  Ordering for someone else
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    We&apos;ll call the recipient and share the delivery code with you.
                  </span>
                </span>
                <Toggle label="Order for someone else" checked={gifting} onChange={setGifting} />
              </div>
              {gifting && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <label>
                    <span className="label">Recipient&apos;s name</span>
                    <input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      maxLength={60}
                      className="input"
                      placeholder="e.g. Priya"
                    />
                  </label>
                  <div>
                    <span className="label">Recipient&apos;s mobile number</span>
                    <PhoneInput value={recipientPhone} onChange={setRecipientPhone} />
                  </div>
                  <label className="sm:col-span-2">
                    <span className="label">Gift message</span>
                    <textarea
                      value={giftMessage}
                      onChange={(e) => setGiftMessage(e.target.value)}
                      maxLength={200}
                      rows={2}
                      className="input"
                      placeholder="Happy birthday! Enjoy dinner on me."
                    />
                  </label>
                  {giftInvalid && <p className="text-xs text-danger sm:col-span-2">Add the recipient&apos;s name and 10-digit mobile number.</p>}
                </div>
              )}
            </Section>
          )}

          <Section title={isPickup ? "Pickup details" : "Delivery preferences"}>
            <div className={`grid gap-6 ${isPickup ? "" : "sm:grid-cols-2"}`}>
              <div>
                <p className="label">When</p>
                <div className="flex gap-2" role="radiogroup" aria-label="Delivery time">
                  <button role="radio" aria-checked={schedule === "NOW"} onClick={() => setSchedule("NOW")} className="chip h-10 px-4">
                    <Clock className="h-3.5 w-3.5" /> Now
                  </button>
                  <button role="radio" aria-checked={schedule === "LATER"} onClick={() => setSchedule("LATER")} className="chip h-10 px-4">
                    Schedule
                  </button>
                </div>
                {schedule === "LATER" && (
                  <input
                    type="datetime-local"
                    aria-label="Scheduled delivery time"
                    value={scheduledAt}
                    min={new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16)}
                    max={new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="input mt-3"
                  />
                )}
                {scheduleInvalid && <p className="hint text-danger">Pick a time at least 15 minutes from now.</p>}
              </div>
              {!isPickup && (
                <label>
                  <span className="label">Hand it to me</span>
                  <select value={deliveryPreference} onChange={(e) => setDeliveryPreference(e.target.value)} className="input">
                    <option value="DOOR">At my door</option>
                    <option value="RECEPTION">At reception</option>
                    <option value="SECURITY">With security</option>
                    <option value="HAND_ME">Hand it to me personally</option>
                  </select>
                </label>
              )}
            </div>
            <div className="mt-6 space-y-4 rounded-2xl bg-subtle p-5">
              {!isPickup && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-3 text-sm text-ink">
                    <DoorClosed className="h-4 w-4 text-ink-soft" />
                    <span>
                      Contactless delivery
                      <span className="mt-0.5 block text-xs text-ink-muted">Left at your door with a photo and OTP confirmation.</span>
                    </span>
                  </span>
                  <Toggle label="Contactless delivery" checked={contactless} onChange={setContactless} />
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-3 text-sm text-ink">
                  <UtensilsCrossed className="h-4 w-4 text-ink-soft" />
                  <span>
                    Send cutlery
                    <span className="mt-0.5 block text-xs text-ink-muted">Skip it to save plastic — you can still request it.</span>
                  </span>
                </span>
                <Toggle label="Send cutlery" checked={cutleryOptIn} onChange={setCutleryOptIn} />
              </div>
              {isPickup && (
                <p className="border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
                  Pay online, then show your pickup code at the counter. Your food is held for 20 minutes after it&apos;s ready.
                </p>
              )}
            </div>
          </Section>

          <Section title={`Your order · ${cart.getItemCount()} ${cart.getItemCount() === 1 ? "item" : "items"}`}>
            <ul className="space-y-6">
              {cart.items.map((line) => (
                <li key={line.lineId} className={`flex items-start gap-4 ${line.menuItemId === missingItemId ? "-mx-4 rounded-2xl bg-danger-soft p-4" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {line.isVeg !== undefined && <VegMark tag={line.isVeg ? "VEG" : "NON_VEG"} />}
                      <h3 className="line-clamp-2 text-[15px] font-medium text-ink">{line.name}</h3>
                    </div>
                    {(line.variantName || line.selectedOptionNames.length > 0) && (
                      <p className="mt-1 text-sm text-ink-muted">{[line.variantName, ...line.selectedOptionNames].filter(Boolean).join(" · ")}</p>
                    )}
                    {line.instructions && <p className="mt-1 text-sm italic text-ink-muted">“{line.instructions}”</p>}
                    {line.menuItemId === missingItemId && (
                      <button onClick={() => cart.removeItem(line.lineId)} className="mt-2 text-sm font-medium text-danger underline underline-offset-4">
                        Remove unavailable item
                      </button>
                    )}
                  </div>
                  <div className="stepper">
                    <button aria-label={`Remove one ${line.name}`} onClick={() => cart.updateQuantity(line.lineId, line.quantity - 1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-5 text-center tabular">{line.quantity}</span>
                    <button aria-label={`Add one ${line.name}`} onClick={() => cart.updateQuantity(line.lineId, line.quantity + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-16 shrink-0 pt-2 text-right text-[15px] text-ink tabular">{formatRupees(line.unitPricePaise * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <label className="mt-8 block">
              <span className="label">Note for the delivery partner</span>
              <textarea
                value={cart.instructions}
                onChange={(e) => cart.setInstructions(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ring the bell, leave with the guard…"
                className="input"
              />
            </label>
          </Section>

          {!isPickup && (
            <Section title={t("checkout.riderTip")}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tip amount">
                {TIP_OPTIONS.map((tVal) => (
                  <button key={tVal} role="radio" aria-checked={cart.tipPaise === tVal} onClick={() => cart.setTip(tVal)} className="chip h-10 px-5">
                    {tVal === 0 ? "No tip" : formatRupees(tVal)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm text-ink-muted">{t("checkout.tipSubtext")}</p>
            </Section>
          )}

          <Section title={t("checkout.paymentMethod")}>
            {corporate.data?.member && !isPickup && (
              <button
                type="button"
                role="switch"
                aria-checked={useCorporate}
                onClick={() => setUseCorporate((v) => !v)}
                disabled={!lunchWindow && !useCorporate}
                className={`mb-4 flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  useCorporate ? "border-ink bg-white" : "border-line bg-subtle/40 hover:border-line-strong"
                }`}
              >
                <span className="flex items-start gap-3">
                  <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
                  <span>
                    <span className="block text-sm font-medium text-ink">Use {corporate.data.companyName} allowance</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {lunchWindow
                        ? `${formatRupees(corporate.data.remainingAllowancePaise ?? 0)} left today · ${corporate.data.costCenterCode}`
                        : "Available 11am–3pm IST on weekdays"}
                    </span>
                  </span>
                </span>
                <span className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition ${useCorporate ? "bg-ink" : "bg-line-strong"}`}>
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${useCorporate ? "translate-x-4" : ""}`} />
                </span>
              </button>
            )}

            {corporateActive ? (
              <div className="rounded-2xl border border-line bg-white p-4 text-sm">
                {corporateSplit.isPending ? (
                  <span className="flex items-center gap-2 text-ink-muted"><Spinner /> Calculating allowance…</span>
                ) : corporateSplit.isError ? (
                  <span className="text-danger">{errorMessage(corporateSplit.error)}</span>
                ) : corporateSplit.data ? (
                  <>
                    <div className="flex justify-between text-ink-muted">
                      <span>Company allowance</span>
                      <span className="font-medium text-success">−{formatRupees(corporateSplit.data.coveredPaise)}</span>
                    </div>
                    <div className="mt-2 flex justify-between font-semibold text-ink">
                      <span>You pay</span>
                      <span className="tabular">{formatRupees(corporateSplit.data.employeePayablePaise)}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">
                      {formatRupees(walletBalance)} credits available for the overage.
                    </p>
                  </>
                ) : null}
                {corporateInsufficient && (
                  <p className="notice notice-warn mt-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Add{" "}
                    {formatRupees(corporateEmployeePayable - walletBalance)} credits or switch off the corporate allowance.
                  </p>
                )}
                <p className="mt-3 text-xs text-ink-muted">
                  The company share is billed monthly with GST; the overage is paid from your credits.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
                  <button
                    role="radio"
                    aria-checked={paymentMethod === PaymentMethod.RAZORPAY}
                    onClick={() => setPaymentMethod(PaymentMethod.RAZORPAY)}
                    className={`rounded-2xl border p-4 text-left transition ${paymentMethod === PaymentMethod.RAZORPAY ? "border-ink bg-white" : "border-line hover:border-line-strong"}`}
                  >
                    <ShieldCheck className="h-5 w-5 text-ink" />
                    <span className="mt-3 block text-sm font-medium text-ink">Cards & UPI</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">Razorpay · instant</span>
                  </button>
                  <button
                    role="radio"
                    aria-checked={paymentMethod === PaymentMethod.WALLET}
                    onClick={() => setPaymentMethod(PaymentMethod.WALLET)}
                    className={`rounded-2xl border p-4 text-left transition ${paymentMethod === PaymentMethod.WALLET ? "border-ink bg-white" : "border-line hover:border-line-strong"}`}
                  >
                    <Wallet className="h-5 w-5 text-ink" />
                    <span className="mt-3 block text-sm font-medium text-ink">BiteBox Credits</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {wallet.isPending ? "Loading…" : `${formatRupees(walletBalance)} available`}
                    </span>
                  </button>
                  <button
                    role="radio"
                    aria-checked={paymentMethod === PaymentMethod.COD}
                    onClick={() => !isPickup && setPaymentMethod(PaymentMethod.COD)}
                    disabled={isPickup}
                    className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      paymentMethod === PaymentMethod.COD ? "border-ink bg-white" : "border-line hover:border-line-strong"
                    }`}
                  >
                    <Banknote className="h-5 w-5 text-ink" />
                    <span className="mt-3 block text-sm font-medium text-ink">Cash on delivery</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{isPickup ? "Unavailable for pickup" : "Pay the partner at the door"}</span>
                  </button>
                </div>
                {isPickup && (
                  <p className="notice notice-neutral mt-4">
                    <Store className="mt-0.5 h-4 w-4 shrink-0" /> Pickup orders are prepaid online. Show your pickup code at the counter.
                  </p>
                )}
                {walletInsufficient && (
                  <p className="notice notice-warn mt-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> You have {formatRupees(walletBalance)} in credits. Pick another
                    payment method or top up through referrals and instant refunds.
                  </p>
                )}
              </>
            )}
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          {/* Offers */}
          <div className="panel p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Tag className="h-4 w-4" /> Offers
            </h2>
            {cart.couponCode ? (
              <div className={`mt-4 flex items-start justify-between gap-3 rounded-2xl bg-white p-4 text-sm ${quote.data?.couponError ? "text-warn" : "text-success"}`}>
                <span>
                  {quote.data?.appliedCouponCode ? (
                    <>
                      <span className="font-semibold">{cart.couponCode}</span> applied · you save {formatRupees(breakdown?.discountPaise ?? 0)}
                    </>
                  ) : (
                    quote.data?.couponError ?? `Checking ${cart.couponCode}…`
                  )}
                </span>
                <button onClick={() => cart.setCoupon(null)} aria-label="Remove coupon" className="text-ink-muted hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (couponInput.trim()) cart.setCoupon(couponInput);
                  setCouponInput("");
                }}
                className="mt-4 flex gap-2"
              >
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  maxLength={30}
                  className="input h-11 min-w-0 flex-1 uppercase"
                />
                <button disabled={!couponInput.trim()} className="btn btn-outline">
                  Apply
                </button>
              </form>
            )}
            {!cart.couponCode && (coupons.data?.length ?? 0) > 0 && (
              <ul className="mt-3 space-y-2">
                {coupons.data!.map((c) => (
                  <li key={c.code}>
                    <button onClick={() => cart.setCoupon(c.code)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left transition-shadow hover:shadow-soft">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{c.code}</span>
                        <span className="block text-xs text-ink-muted">{c.description}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bill */}
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">Bill summary</h2>
            {quote.data?.membership && (
              <p className={`notice mt-4 ${quote.data.membership.freeDeliveryApplied ? "notice-success" : "notice-neutral"}`}>
                <Crown className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{quote.data.membership.name}</strong>{" "}
                  {quote.data.membership.freeDeliveryApplied
                    ? "· free delivery applied"
                    : "· free delivery on qualifying orders"}
                </span>
              </p>
            )}
            {quoteError && (
              <p className="notice notice-danger mt-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {quoteError.message}
              </p>
            )}
            {!selectedAddress ? (
              <p className="mt-4 text-sm text-ink-muted">Add a delivery address to see delivery fee and taxes.</p>
            ) : quote.isFetching && !breakdown ? (
              <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
                <Spinner /> Calculating…
              </div>
            ) : breakdown ? (
              <dl className={`mt-5 space-y-3 text-sm transition-opacity ${quote.isFetching ? "opacity-50" : ""}`}>
                {billRows.map(([label, value]) => (
                  <div key={label} className="flex justify-between text-ink-muted">
                    <dt>{label}</dt>
                    <dd className="text-ink tabular">{formatRupees(value)}</dd>
                  </div>
                ))}
                {breakdown.discountPaise > 0 && (
                  <div className="flex justify-between text-success">
                    <dt>Discount</dt>
                    <dd className="tabular">−{formatRupees(breakdown.discountPaise)}</dd>
                  </div>
                )}
                {corporateActive && corporateSplit.data && (
                  <div className="flex justify-between text-success">
                    <dt>{corporate.data?.companyName} allowance</dt>
                    <dd className="tabular">−{formatRupees(corporateSplit.data.coveredPaise)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-4 text-base font-semibold text-ink">
                  <dt>{corporateActive && corporateSplit.data ? "You pay" : "To pay"}</dt>
                  <dd className="tabular">{formatRupees(displayPayable)}</dd>
                </div>
                {quote.data && (
                  <p className="pt-1 text-xs text-ink-muted">
                    {isPickup
                      ? `Ready in about ${quote.data.estimatedMinMinutes}–${quote.data.estimatedMaxMinutes} min`
                      : `Arrives in about ${quote.data.estimatedMinMinutes}–${quote.data.estimatedMaxMinutes} min`}
                  </p>
                )}
                {breakdown.subtotalPaise > 0 && (
                  <p className="text-xs text-ink-muted">
                    You&apos;ll earn{" "}
                    <span className="font-medium text-success">
                      {formatRupees(Math.min(5000, Math.round((breakdown.subtotalPaise * 200) / 10000)))}
                    </span>{" "}
                    back in credits after delivery.
                  </p>
                )}
              </dl>
            ) : null}

            <div className="mt-6 hidden lg:block">{payButton}</div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              {isPickup
                ? "Prepaid pickup · collect at the counter"
                : corporateActive
                  ? "Company allowance applied · billed monthly with GST"
                  : paymentMethod === PaymentMethod.RAZORPAY
                    ? "Secured by Razorpay · UPI, cards, netbanking"
                    : paymentMethod === PaymentMethod.WALLET
                      ? "Instant · no gateway needed"
                      : "Pay cash when your order arrives"}
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile pay bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl lg:hidden">{payButton}</div>

      <LocationSheet open={addressSheetOpen} onClose={() => setAddressSheetOpen(false)} requireSavedAddress />

      {/* Development-only stand-in for Razorpay when the server has no gateway credentials */}
      <Modal
        open={!!simulated}
        onClose={() => {
          setSimulated(null);
          toast("Payment cancelled. You can try again.");
        }}
        size="sm"
        title="Test payment"
        description={`This server runs without Razorpay credentials, so payment is simulated. Order ${simulated?.orderNumber ?? ""}.`}
        footer={
          <button
            onClick={async () => {
              if (!simulated) return;
              setPaying(true);
              try {
                await finishPayment(simulated, { paymentId: `pay_sim_${Date.now()}`, signature: "mock_valid_sig_verification_token" });
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setPaying(false);
                setSimulated(null);
              }
            }}
            disabled={paying}
            className="btn btn-success btn-lg btn-block"
          >
            {paying && <Spinner />} Pay {simulated ? formatRupees(simulated.amountPaise) : ""}
          </button>
        }
      />
    </div>
  );
}

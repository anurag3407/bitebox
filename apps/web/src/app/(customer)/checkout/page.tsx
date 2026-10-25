"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Lock, MapPin, Minus, Plus, ShieldCheck, ShoppingBag, Tag, X } from "lucide-react";
import { CheckoutResponse } from "@startup/contracts";
import { ApiError } from "@startup/api-client";
import { useCartStore } from "@/features/cart/cart-store";
import { useCartHydrated } from "@/features/hydration";
import { useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { LocationSheet } from "@/components/location/location-sheet";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageSpinner, Spinner, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
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

  const addresses = useQuery({ queryKey: ["addresses"], queryFn: () => api.getAddresses(), enabled: isSignedIn });
  const coupons = useQuery({
    queryKey: ["coupons", cart.restaurantId],
    queryFn: () => api.getAvailableCoupons(cart.restaurantId ?? undefined),
    enabled: !!cart.restaurantId,
  });

  // Fall back to the default saved address when the chosen location is only a map pin
  const selectedAddress = useMemo(() => {
    const list = addresses.data ?? [];
    return list.find((a) => a.id === addressId) ?? list.find((a) => a.isDefault) ?? list[0] ?? null;
  }, [addresses.data, addressId]);

  const quoteInput = useDebounced(
    {
      restaurantId: cart.restaurantId,
      addressId: selectedAddress?.id,
      items: cart.items.map((i) => ({
        menuItemId: i.menuItemId,
        variantId: i.variantId,
        selectedOptionIds: i.selectedOptionIds,
        quantity: i.quantity,
        instructions: i.instructions,
      })),
      couponCode: cart.couponCode ?? undefined,
      tipPaise: cart.tipPaise,
    },
    350
  );

  const quote = useQuery({
    queryKey: ["quote", quoteInput],
    queryFn: () =>
      api.createQuote({
        restaurantId: quoteInput.restaurantId!,
        deliveryAddressId: quoteInput.addressId!,
        items: quoteInput.items,
        couponCode: quoteInput.couponCode,
        tipPaise: quoteInput.tipPaise,
      }),
    enabled: isSignedIn && !placedOrderId && !!quoteInput.restaurantId && !!quoteInput.addressId && quoteInput.items.length > 0,
    staleTime: 4 * 60_000,
    retry: false,
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
  const canPay = !paying && !!breakdown && !!selectedAddress && !quote.isFetching && !quoteError;

  const finishPayment = async (checkout: CheckoutResponse, payment: { paymentId: string; signature: string }) => {
    const result = await api.verifyPayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: payment.paymentId,
      razorpaySignature: payment.signature,
    });
    setPlacedOrderId(checkout.orderId);
    cart.clearCart();
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    if (result.status === "CONFIRMING") toast("Payment received. Confirming with your bank…");
    router.push(`/orders/${checkout.orderId}`);
  };

  const placeOrder = async () => {
    if (!quote.data || !selectedAddress || !idempotencyKey || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    try {
      const checkout = await api.createCheckout({
        quoteId: quote.data.quoteId,
        deliveryAddressId: selectedAddress.id,
        instructions: cart.instructions || undefined,
        idempotencyKey,
      });

      if (checkout.simulatedPayment) {
        setSimulated(checkout);
        return;
      }

      const result = await openRazorpayCheckout({
        keyId: checkout.razorpayKeyId,
        razorpayOrderId: checkout.razorpayOrderId,
        amountPaise: checkout.amountPaise,
        orderNumber: checkout.orderNumber,
        prefill: { name: me.data?.name, email: me.data?.email ?? undefined, contact: me.data?.phone ?? selectedAddress.contactPhone },
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

  const payButton = (
    <button onClick={placeOrder} disabled={!canPay} className="btn btn-primary btn-lg btn-block justify-between">
      <span className="flex items-center gap-2">
        {paying ? <Spinner /> : <Lock className="h-4 w-4" />} {paying ? "Processing…" : "Pay securely"}
      </span>
      <span className="tabular">{breakdown ? formatRupees(breakdown.payablePaise) : ""}</span>
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
          <Section
            title="Deliver to"
            action={
              <button onClick={() => setAddressSheetOpen(true)} className="btn btn-ghost btn-sm -mr-4">
                {selectedAddress ? "Change" : "Add"}
              </button>
            }
          >
            {addresses.isPending ? (
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
            {(addresses.data?.length ?? 0) > 1 && (
              <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                {addresses.data!.map((a) => (
                  <button key={a.id} onClick={() => setAddress(a)} aria-pressed={a.id === selectedAddress?.id} className="chip">
                    {a.label}
                  </button>
                ))}
              </div>
            )}
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

          <Section title="Tip your delivery partner">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tip amount">
              {TIP_OPTIONS.map((t) => (
                <button key={t} role="radio" aria-checked={cart.tipPaise === t} onClick={() => cart.setTip(t)} className="chip h-10 px-5">
                  {t === 0 ? "No tip" : formatRupees(t)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-muted">100% of your tip goes to the partner.</p>
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
                <div className="flex justify-between border-t border-line pt-4 text-base font-semibold text-ink">
                  <dt>To pay</dt>
                  <dd className="tabular">{formatRupees(breakdown.payablePaise)}</dd>
                </div>
                {quote.data && (
                  <p className="pt-1 text-xs text-ink-muted">
                    Arrives in about {quote.data.estimatedMinMinutes}–{quote.data.estimatedMaxMinutes} min
                  </p>
                )}
              </dl>
            ) : null}

            <div className="mt-6 hidden lg:block">{payButton}</div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" /> Secured by Razorpay · UPI, cards, netbanking
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

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Tag, ShieldCheck, CreditCard, Lock, AlertTriangle, Bike, ChevronRight, Check } from "lucide-react";
import { CheckoutResponse } from "@startup/contracts";
import { ApiError } from "@startup/api-client";
import { useCartStore } from "@/features/cart/cart-store";
import { addressLabel, useLocationStore } from "@/features/location/location-store";
import { useAuth } from "@/features/auth/auth-context";
import { LocationSheet } from "@/components/location/location-sheet";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Spinner, VegMark } from "@/components/ui/misc";
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

export default function CheckoutPage() {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cart = useCartStore();
  const { isSignedIn, isLoaded } = useAuth();
  const me = useMe();
  const { addressId, setAddress } = useLocationStore();
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [paying, setPaying] = useState(false);
  const [simulated, setSimulated] = useState<CheckoutResponse | null>(null);

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
    enabled: isSignedIn && !!quoteInput.restaurantId && !!quoteInput.addressId && quoteInput.items.length > 0,
    staleTime: 4 * 60_000,
    retry: false,
  });

  // A quote expires after 10 minutes; refresh it in the background before it does
  useEffect(() => {
    if (!quote.data) return;
    const msLeft = new Date(quote.data.expiresAt).getTime() - Date.now() - 30_000;
    const t = setTimeout(() => quote.refetch(), Math.max(5_000, msLeft));
    return () => clearTimeout(t);
  }, [quote.data, quote]);

  // One idempotency key per priced quote: double taps and retries never create two orders
  const idempotencyKey = useMemo(
    () => (quote.data ? `chk_${quote.data.quoteId}_${crypto.randomUUID().slice(0, 8)}` : null),
    [quote.data]
  );
  const payingRef = useRef(false);

  if (cart.items.length === 0) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <EmptyState
          title="Your cart is empty"
          body="Add dishes from a restaurant near you to get started."
          action={
            <button onClick={() => router.push("/")} className="px-6 py-3 bg-brand text-white text-xs font-bold rounded-xl">
              Explore restaurants
            </button>
          }
        />
      </div>
    );
  }

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <EmptyState
          title="Sign in to place your order"
          body="Your cart is saved on this device."
          action={
            <Link href="/sign-in?redirect_url=/checkout" className="inline-block px-6 py-3 bg-brand text-white text-xs font-bold rounded-xl">
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const quoteError = quote.error instanceof ApiError ? quote.error : null;
  const missingItemId = (quoteError?.details as { menuItemId?: string } | undefined)?.menuItemId;
  const breakdown = quote.data?.breakdown;

  const finishPayment = async (checkout: CheckoutResponse, payment: { paymentId: string; signature: string }) => {
    const result = await api.verifyPayment({
      orderId: checkout.orderId,
      razorpayOrderId: checkout.razorpayOrderId,
      razorpayPaymentId: payment.paymentId,
      razorpaySignature: payment.signature,
    });
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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-black text-text-primary tracking-tight">Checkout</h1>
      <p className="text-xs text-text-secondary mb-6">
        Ordering from{" "}
        <Link href={`/restaurants/${cart.restaurantSlug}`} className="font-bold text-text-primary underline">
          {cart.restaurantName}
        </Link>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Address */}
          <section className="bg-white rounded-3xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand" /> Delivery address
              </h2>
              <button onClick={() => setAddressSheetOpen(true)} className="text-xs font-bold text-brand">
                {selectedAddress ? "Change" : "Add address"}
              </button>
            </div>
            {addresses.isPending ? (
              <div className="h-16 bg-surface-muted rounded-2xl animate-pulse" />
            ) : selectedAddress ? (
              <div className="p-4 rounded-2xl bg-surface-muted border border-border">
                <span className="text-[10px] font-bold text-brand uppercase bg-brand-light px-2 py-0.5 rounded-full">{selectedAddress.label}</span>
                <p className="font-bold text-sm mt-1">{selectedAddress.building}</p>
                <p className="text-xs text-text-secondary">{selectedAddress.street}</p>
              </div>
            ) : (
              <button onClick={() => setAddressSheetOpen(true)} className="w-full p-4 rounded-2xl border-2 border-dashed border-border text-sm font-semibold text-text-secondary">
                Add a delivery address to see the final bill
              </button>
            )}
            {(addresses.data?.length ?? 0) > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {addresses.data!.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAddress(a)}
                    className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold ${a.id === selectedAddress?.id ? "border-brand text-brand bg-brand-light" : "border-border"}`}
                  >
                    {a.label}: {addressLabel(a).slice(0, 28)}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Items */}
          <section className="bg-white rounded-3xl border border-border p-5">
            <h2 className="font-bold mb-2">Items ({cart.getItemCount()})</h2>
            <ul className="divide-y divide-border">
              {cart.items.map((line) => (
                <li key={line.lineId} className={`py-4 flex items-center justify-between gap-4 ${line.menuItemId === missingItemId ? "bg-red-50 -mx-2 px-2 rounded-xl" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {line.isVeg !== undefined && <VegMark tag={line.isVeg ? "VEG" : "NON_VEG"} />}
                      <h3 className="font-bold text-sm truncate">{line.name}</h3>
                    </div>
                    {line.variantName && <p className="text-xs text-text-secondary">{line.variantName}</p>}
                    {line.selectedOptionNames.length > 0 && <p className="text-[11px] text-text-secondary">{line.selectedOptionNames.join(", ")}</p>}
                    {line.instructions && <p className="text-[11px] text-text-secondary italic">“{line.instructions}”</p>}
                    <p className="text-xs font-bold mt-1">{formatRupees(line.unitPricePaise * line.quantity)}</p>
                    {line.menuItemId === missingItemId && (
                      <button onClick={() => cart.removeItem(line.lineId)} className="text-xs font-bold text-red-700 underline mt-1">
                        Remove unavailable item
                      </button>
                    )}
                  </div>
                  <div className="flex items-center border border-brand/40 rounded-lg text-brand font-black">
                    <button aria-label={`Remove one ${line.name}`} onClick={() => cart.updateQuantity(line.lineId, line.quantity - 1)} className="px-2.5 py-1">
                      −
                    </button>
                    <span className="px-1 text-xs min-w-5 text-center">{line.quantity}</span>
                    <button aria-label={`Add one ${line.name}`} onClick={() => cart.updateQuantity(line.lineId, line.quantity + 1)} className="px-2.5 py-1">
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <textarea
              value={cart.instructions}
              onChange={(e) => cart.setInstructions(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Delivery instructions (e.g. ring the bell, leave with the guard)"
              className="w-full mt-3 p-3 bg-surface-muted border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </section>

          {/* Tip */}
          <section className="bg-white rounded-3xl border border-border p-5">
            <h2 className="font-bold flex items-center gap-2">
              <Bike className="w-5 h-5 text-brand" /> Tip your delivery partner
            </h2>
            <p className="text-xs text-text-secondary mt-0.5 mb-3">100% of the tip goes to your delivery partner.</p>
            <div className="flex gap-2 flex-wrap">
              {TIP_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => cart.setTip(t)}
                  aria-pressed={cart.tipPaise === t}
                  className={`px-4 py-2 rounded-xl border text-sm font-bold ${cart.tipPaise === t ? "bg-brand-light border-brand text-brand" : "border-border"}`}
                >
                  {t === 0 ? "No tip" : formatRupees(t)}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* Coupons */}
          <section className="bg-white rounded-3xl border border-border p-5">
            <h2 className="font-bold text-sm flex items-center gap-1.5 mb-3">
              <Tag className="w-4 h-4 text-brand" /> Offers & coupons
            </h2>
            {cart.couponCode ? (
              <div className={`p-3 rounded-xl flex items-start justify-between text-xs font-bold ${quote.data?.couponError ? "bg-amber-50 text-amber-900" : "bg-success-light text-success"}`}>
                <span>
                  {quote.data?.appliedCouponCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 inline" /> {cart.couponCode} applied — you save {formatRupees(breakdown?.discountPaise ?? 0)}
                    </>
                  ) : (
                    quote.data?.couponError ?? `Checking ${cart.couponCode}…`
                  )}
                </span>
                <button onClick={() => cart.setCoupon(null)} className="underline text-text-secondary shrink-0 ml-2">
                  Remove
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (couponInput.trim()) cart.setCoupon(couponInput);
                  setCouponInput("");
                }}
                className="flex gap-2"
              >
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code"
                  maxLength={30}
                  className="flex-1 min-w-0 px-3 py-2 bg-surface-muted border border-border rounded-xl text-xs uppercase font-bold focus:outline-none"
                />
                <button className="px-4 py-2 bg-text-primary text-white text-xs font-bold rounded-xl">Apply</button>
              </form>
            )}
            {!cart.couponCode && (coupons.data?.length ?? 0) > 0 && (
              <ul className="mt-3 space-y-2">
                {coupons.data!.map((c) => (
                  <li key={c.code}>
                    <button onClick={() => cart.setCoupon(c.code)} className="w-full text-left p-3 rounded-xl border border-dashed border-brand/40 hover:bg-brand-light/40 flex items-center justify-between">
                      <span>
                        <span className="block text-xs font-black text-brand">{c.code}</span>
                        <span className="block text-[11px] text-text-secondary">{c.description}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-secondary" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Bill */}
          <section className="bg-white rounded-3xl border border-border p-5 lg:sticky lg:top-24">
            <h2 className="font-bold mb-4">Bill details</h2>
            {quoteError && (
              <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {quoteError.message}
              </div>
            )}
            {!selectedAddress ? (
              <p className="text-xs text-text-secondary">Add a delivery address to see delivery fee and taxes.</p>
            ) : quote.isFetching && !breakdown ? (
              <div className="py-6 text-center text-xs text-text-secondary">
                <Spinner /> Calculating…
              </div>
            ) : breakdown ? (
              <dl className={`space-y-2 text-xs text-text-secondary ${quote.isFetching ? "opacity-60" : ""}`}>
                {[
                  ["Item total", breakdown.subtotalPaise],
                  ["Delivery fee", breakdown.deliveryFeePaise + breakdown.surgePaise],
                  ["Packaging", breakdown.packagingPaise],
                  ["Platform fee", breakdown.platformFeePaise],
                  ["GST & charges", breakdown.taxPaise],
                  ...(breakdown.tipPaise ? [["Delivery partner tip", breakdown.tipPaise] as const] : []),
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between">
                    <dt>{label}</dt>
                    <dd className="text-text-primary font-medium">{formatRupees(value as number)}</dd>
                  </div>
                ))}
                {breakdown.discountPaise > 0 && (
                  <div className="flex justify-between text-success font-bold">
                    <dt>Coupon discount</dt>
                    <dd>−{formatRupees(breakdown.discountPaise)}</dd>
                  </div>
                )}
                <div className="pt-3 border-t border-border flex justify-between text-sm font-black text-text-primary">
                  <dt>To pay</dt>
                  <dd>{formatRupees(breakdown.payablePaise)}</dd>
                </div>
                {quote.data && (
                  <p className="text-[11px] pt-1">
                    Estimated delivery in {quote.data.estimatedMinMinutes}–{quote.data.estimatedMaxMinutes} min
                  </p>
                )}
              </dl>
            ) : null}

            <button
              onClick={placeOrder}
              disabled={paying || !breakdown || !selectedAddress || quote.isFetching || !!quoteError}
              className="w-full mt-5 py-4 px-5 rounded-2xl font-black text-sm flex items-center justify-between bg-brand hover:bg-brand-hover text-white disabled:bg-gray-300 disabled:text-gray-500"
            >
              <span className="flex items-center gap-2">
                {paying ? <Spinner /> : <Lock className="w-4 h-4" />} {paying ? "Processing…" : "Proceed to pay"}
              </span>
              <span>{breakdown ? formatRupees(breakdown.payablePaise) : ""}</span>
            </button>
            <p className="text-[10px] text-text-secondary text-center mt-2 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Payments secured by Razorpay. UPI, cards, netbanking & wallets.
            </p>
          </section>
        </div>
      </div>

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
        description="This server runs without Razorpay credentials, so payment is simulated."
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
            className="w-full py-3 rounded-xl bg-success text-white text-sm font-black flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" /> Pay {simulated ? formatRupees(simulated.amountPaise) : ""}
          </button>
        }
      >
        <p className="text-xs text-text-secondary">Order {simulated?.orderNumber}</p>
      </Modal>
    </div>
  );
}

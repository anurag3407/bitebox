"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Tag,
  ShieldCheck,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { AddressDto, QuoteBreakdown } from "@startup/contracts";
import { ApiClient } from "@startup/api-client";
import { useCartStore } from "@/features/cart/cart-store";
import { useLocationStore } from "@/features/location/location-store";
import { useAuthStore } from "@/features/auth/auth-store";

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCartStore();
  const { currentLocation, selectedAddress, setSelectedAddress } = useLocationStore();
  const { getToken } = useAuthStore();

  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<QuoteBreakdown | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeRazorpayOrderId, setActiveRazorpayOrderId] = useState<string | null>(null);

  // Load saved addresses
  useEffect(() => {
    async function loadAddresses() {
      try {
        const client = new ApiClient({ baseUrl: "", getToken });
        const list = await client.getAddresses();
        setAddresses(list);
        if (list[0] && !selectedAddress) {
          setSelectedAddress(list[0]);
        }
      } catch (err) {
        console.error("Failed to load addresses:", err);
      }
    }
    loadAddresses();
  }, [getToken, selectedAddress, setSelectedAddress]);

  // Re-quote when items or coupon changes
  useEffect(() => {
    if (cart.items.length === 0 || !cart.restaurantId) {
      setBreakdown(null);
      return;
    }

    async function fetchQuote() {
      setIsQuoting(true);
      try {
        const client = new ApiClient({ baseUrl: "", getToken });
        const quoteRes = await client.createQuote({
          restaurantId: cart.restaurantId!,
          deliveryAddressId: selectedAddress?.id,
          destinationLocation: currentLocation,
          items: cart.items.map((i) => ({
            menuItemId: i.menuItemId,
            variantId: i.variantId,
            selectedOptionIds: i.selectedOptionIds,
            quantity: i.quantity,
            instructions: i.instructions,
          })),
          couponCode: appliedCoupon || undefined,
        });

        setQuoteId(quoteRes.quoteId);
        setBreakdown(quoteRes.breakdown);
      } catch (err) {
        console.error("Failed to get quote:", err);
      } finally {
        setIsQuoting(false);
      }
    }

    fetchQuote();
  }, [cart.items, cart.restaurantId, selectedAddress, currentLocation, appliedCoupon, getToken]);

  if (cart.items.length === 0) {
    return (
      <div className="max-w-md mx-auto my-24 p-8 text-center bg-white rounded-3xl border border-border shadow-xs">
        <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <CreditCard className="w-8 h-8 text-text-secondary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Your cart is empty</h2>
        <p className="text-xs text-text-secondary mt-1 mb-6">
          Explore top-rated restaurants near you to add delicious meals to your cart.
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-6 py-3 bg-brand text-white text-xs font-bold rounded-xl shadow-md hover:bg-brand-hover transition-all"
        >
          Explore Restaurants
        </button>
      </div>
    );
  }

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setAppliedCoupon(couponCode.trim().toUpperCase());
  };

  const handlePlaceOrder = async () => {
    if (!quoteId || !selectedAddress || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const client = new ApiClient({ baseUrl: "", getToken });
      const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // 1. Create Checkout & Provider Order
      const checkoutResult = await client.createCheckout({
        quoteId,
        deliveryAddressId: selectedAddress.id,
        instructions: cart.instructions || undefined,
        idempotencyKey,
      });

      setActiveOrderId(checkoutResult.orderId);
      setActiveRazorpayOrderId(checkoutResult.razorpayOrderId);
      setPaymentModalOpen(true);
    } catch (err: any) {
      alert(`Checkout failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSimulatePaymentSuccess = async () => {
    if (!activeOrderId || !activeRazorpayOrderId) return;
    setIsSubmitting(true);
    try {
      const client = new ApiClient({ baseUrl: "", getToken });
      // Simulate Razorpay payment callback verification with mock valid signature
      await client.verifyPayment({
        orderId: activeOrderId,
        razorpayOrderId: activeRazorpayOrderId,
        razorpayPaymentId: `pay_mock_${Date.now()}`,
        razorpaySignature: "mock_valid_sig_verification_token",
      });

      // Clear local cart
      cart.clearCart();
      setPaymentModalOpen(false);

      // Navigate to Order Tracking
      router.push(`/orders/${activeOrderId}`);
    } catch (err: any) {
      alert(`Payment verification failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text-primary tracking-tight">Checkout</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Order from <span className="font-bold text-text-primary">{cart.restaurantName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Address & Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Delivery Address Card */}
          <div className="bg-white rounded-3xl border border-border p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand" />
                <h3 className="font-bold text-base text-text-primary">Delivery Address</h3>
              </div>
              <button
                onClick={() => {
                  const bldg = prompt("Enter Building / Flat No:", "Flat 101, Palm Court");
                  const street = prompt("Enter Street / Area:", "Connaught Place Outer Circle");
                  if (bldg && street) {
                    const client = new ApiClient({ baseUrl: "", getToken });
                    client
                      .createAddress({
                        label: "Other",
                        building: bldg,
                        street,
                        latitude: currentLocation.latitude,
                        longitude: currentLocation.longitude,
                        isDefault: true,
                      })
                      .then((newAddr) => {
                        setAddresses([newAddr, ...addresses]);
                        setSelectedAddress(newAddr);
                      });
                  }
                }}
                className="text-xs font-bold text-brand hover:underline"
              >
                + Add New Address
              </button>
            </div>

            {selectedAddress ? (
              <div className="p-4 rounded-2xl bg-surface-muted border border-border flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-brand uppercase bg-brand-light px-2 py-0.5 rounded-full">
                    {selectedAddress.label}
                  </span>
                  <h4 className="font-bold text-sm text-text-primary mt-1">
                    {selectedAddress.building}
                  </h4>
                  <p className="text-xs text-text-secondary">{selectedAddress.street}</p>
                  {selectedAddress.landmark && (
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      Landmark: {selectedAddress.landmark}
                    </p>
                  )}
                </div>
                <span className="text-xs font-bold text-success flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Deliver Here
                </span>
              </div>
            ) : (
              <p className="text-xs text-text-secondary">Please select or add a delivery address</p>
            )}
          </div>

          {/* 2. Order Items Review */}
          <div className="bg-white rounded-3xl border border-border p-6 shadow-xs">
            <h3 className="font-bold text-base text-text-primary mb-4">
              Items Selected ({cart.getItemCount()})
            </h3>

            <div className="divide-y divide-border">
              {cart.items.map((line) => (
                <div key={line.lineId} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-text-primary">{line.name}</h4>
                    {line.variantName && (
                      <p className="text-xs text-text-secondary font-medium">
                        Portion: {line.variantName}
                      </p>
                    )}
                    {line.selectedOptionNames.length > 0 && (
                      <p className="text-[11px] text-text-secondary">
                        Add-ons: {line.selectedOptionNames.join(", ")}
                      </p>
                    )}
                    <p className="text-xs font-bold text-text-primary mt-1">
                      ₹{(line.unitPricePaise / 100).toFixed(0)} × {line.quantity} = ₹
                      {((line.unitPricePaise * line.quantity) / 100).toFixed(0)}
                    </p>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-border bg-surface-muted rounded-xl">
                    <button
                      onClick={() => cart.updateQuantity(line.lineId, line.quantity - 1)}
                      className="px-2.5 py-1 text-text-secondary hover:text-brand font-bold text-sm"
                    >
                      −
                    </button>
                    <span className="px-2 text-xs font-bold text-text-primary">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => cart.updateQuantity(line.lineId, line.quantity + 1)}
                      className="px-2.5 py-1 text-text-secondary hover:text-brand font-bold text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Special Instructions Field */}
            <div className="mt-4 pt-4 border-t border-border">
              <input
                type="text"
                value={cart.instructions}
                onChange={(e) => cart.setInstructions(e.target.value)}
                placeholder="Write special delivery instructions (e.g. Ring the doorbell, leave with guard)..."
                className="w-full p-3 bg-surface-muted border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Coupons & Bill Details */}
        <div className="space-y-6">
          {/* Coupon Code Card */}
          <div className="bg-white rounded-3xl border border-border p-6 shadow-xs">
            <h3 className="font-bold text-sm text-text-primary flex items-center gap-1.5 mb-3">
              <Tag className="w-4 h-4 text-brand" />
              <span>Coupons & Offers</span>
            </h3>

            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter coupon (e.g. WELCOME50)"
                className="flex-1 px-3 py-2 bg-surface-muted border border-border rounded-xl text-xs uppercase font-bold focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-text-primary text-white text-xs font-bold rounded-xl hover:bg-black transition-colors"
              >
                Apply
              </button>
            </form>

            {appliedCoupon && (
              <div className="mt-2.5 p-2 bg-success-light rounded-xl flex items-center justify-between text-xs text-success font-bold">
                <span>Coupon &apos;{appliedCoupon}&apos; applied!</span>
                <button
                  onClick={() => setAppliedCoupon(null)}
                  className="text-[11px] underline text-text-secondary"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Canonical Bill Breakdown */}
          <div className="bg-white rounded-3xl border border-border p-6 shadow-xs">
            <h3 className="font-bold text-base text-text-primary mb-4">Bill Details</h3>

            {isQuoting ? (
              <div className="py-6 text-center text-xs text-text-secondary animate-pulse">
                Calculating exact server totals...
              </div>
            ) : breakdown ? (
              <div className="space-y-2.5 text-xs text-text-secondary">
                <div className="flex items-center justify-between">
                  <span>Item Subtotal</span>
                  <span className="font-medium text-text-primary">
                    ₹{(breakdown.subtotalPaise / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Delivery Partner Fee</span>
                  <span className="font-medium text-text-primary">
                    ₹{(breakdown.deliveryFeePaise / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Restaurant Packaging Charges</span>
                  <span className="font-medium text-text-primary">
                    ₹{(breakdown.packagingPaise / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Platform Fee</span>
                  <span className="font-medium text-text-primary">
                    ₹{(breakdown.platformFeePaise / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span>Taxes & GST (5% Food + 18% Services)</span>
                  <span className="font-medium text-text-primary">
                    ₹{(breakdown.taxPaise / 100).toFixed(2)}
                  </span>
                </div>

                {breakdown.discountPaise > 0 && (
                  <div className="flex items-center justify-between text-success font-bold">
                    <span>Coupon Discount</span>
                    <span>−₹{(breakdown.discountPaise / 100).toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-border flex items-center justify-between text-sm font-black text-text-primary">
                  <span>Total To Pay</span>
                  <span className="text-brand text-base">
                    ₹{(breakdown.payablePaise / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting || !selectedAddress || !breakdown}
              className={`w-full mt-6 py-4 px-6 rounded-2xl font-black text-sm flex items-center justify-between shadow-lg transition-all ${
                isSubmitting || !selectedAddress || !breakdown
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-brand hover:bg-brand-hover text-white cursor-pointer active:scale-98"
              }`}
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-white/80" />
                <span>{isSubmitting ? "Securing Order..." : "Pay via Razorpay"}</span>
              </div>
              <div className="flex items-center gap-1 font-black">
                <span>
                  {breakdown ? `₹${(breakdown.payablePaise / 100).toFixed(0)}` : "..."}
                </span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Simulated Razorpay Checkout Gateway Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-border">
            {/* Razorpay Gateway Header */}
            <div className="bg-[#0c2340] text-white p-6 text-center">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-2 font-black text-lg shadow-md">
                ₹
              </div>
              <h3 className="font-bold text-base">Razorpay Trusted Payment Gateway</h3>
              <p className="text-xs text-blue-200 mt-0.5">Secure 256-bit Encrypted Checkout</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-surface-muted rounded-2xl border border-border">
                <p className="text-xs text-text-secondary">Amount to be charged:</p>
                <p className="text-2xl font-black text-text-primary mt-0.5">
                  ₹{breakdown ? (breakdown.payablePaise / 100).toFixed(2) : ""}
                </p>
                <p className="text-[11px] text-text-secondary mt-1">
                  Razorpay Order: {activeRazorpayOrderId}
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Test mode active: Click <strong>&quot;Authorize & Capture Payment&quot;</strong> to simulate instant bank confirmation.
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPaymentModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-border text-xs font-bold text-text-secondary hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSimulatePaymentSuccess}
                  disabled={isSubmitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-success hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all"
                >
                  {isSubmitting ? "Verifying..." : "Authorize & Pay"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

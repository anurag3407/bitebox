"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  MapPin,
  Bike,
  Store,
  KeyRound,
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Phone,
  HelpCircle,
} from "lucide-react";
import { FulfillmentState, OrderDetailDto } from "@startup/contracts";
import { ApiClient } from "@startup/api-client";
import { useAuthStore } from "@/features/auth/auth-store";

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const router = useRouter();
  const { getToken } = useAuthStore();

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOrder = async () => {
    setIsRefreshing(true);
    try {
      const client = new ApiClient({ baseUrl: "", getToken });
      const data = await client.getOrder(orderId);
      setOrder(data);
    } catch (err) {
      console.error("Failed to fetch order:", err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // Poll every 4 seconds to observe real-time status progression from merchant/rider
    const timer = setInterval(fetchOrder, 4000);
    return () => clearInterval(timer);
  }, [orderId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 animate-pulse space-y-6">
        <div className="h-10 bg-surface-muted rounded-xl w-48" />
        <div className="h-48 bg-surface-muted rounded-3xl" />
        <div className="h-64 bg-surface-muted rounded-3xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto my-24 p-8 text-center bg-surface-muted rounded-3xl border border-border">
        <h2 className="text-xl font-bold text-text-primary">Order not found</h2>
        <p className="text-xs text-text-secondary mt-1 mb-6">
          The requested order ID does not exist or you do not have permission to view it.
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl"
        >
          Back to Discovery
        </button>
      </div>
    );
  }

  const isCancelled = order.fulfillmentState === FulfillmentState.CANCELLED;
  const isDelivered = order.fulfillmentState === FulfillmentState.DELIVERED;

  // Timeline Step Status
  const getStepStatus = (stepState: FulfillmentState) => {
    const states: FulfillmentState[] = [
      FulfillmentState.AWAITING_MERCHANT,
      FulfillmentState.ACCEPTED,
      FulfillmentState.PREPARING,
      FulfillmentState.READY_FOR_PICKUP,
      FulfillmentState.OUT_FOR_DELIVERY,
      FulfillmentState.DELIVERED,
    ];

    const currentIndex = states.indexOf(order.fulfillmentState as FulfillmentState);
    const stepIndex = states.indexOf(stepState);

    if (currentIndex > stepIndex) return "COMPLETED";
    if (currentIndex === stepIndex) return "CURRENT";
    return "PENDING";
  };

  const canCancel =
    order?.fulfillmentState === FulfillmentState.AWAITING_MERCHANT ||
    order?.fulfillmentState === FulfillmentState.ACCEPTED;

  const handleCancelOrder = async () => {
    if (!confirm("Are you sure you want to cancel this order? A full refund will be processed immediately.")) return;
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reason: "Cancelled by customer via app" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to cancel order");
      }
      alert("Order successfully cancelled. Refund processed!");
      await fetchOrder();
    } catch (err: any) {
      alert(`Cancellation failed: ${err.message}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back and Refresh Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-brand transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        <div className="flex items-center gap-2">
          {canCancel && (
            <button
              onClick={handleCancelOrder}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
            >
              <span>Cancel Order</span>
            </button>
          )}

          <button
            onClick={fetchOrder}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-muted border border-border rounded-xl text-xs font-bold text-text-primary hover:bg-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-brand" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Order Header Banner */}
      <div className="bg-white rounded-3xl border border-border p-6 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Order #{order.orderNumber}
              </span>
              <span
                className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                  isDelivered
                    ? "bg-success-light text-success border border-success/30"
                    : isCancelled
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {order.fulfillmentState.replace(/_/g, " ")}
              </span>
            </div>

            <h1 className="text-2xl font-black text-text-primary tracking-tight mt-1">
              {order.restaurant.name}
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Placed at {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          {/* Delivery OTP Challenge Callout (For Customer Handshake) */}
          {!isDelivered && !isCancelled && order.deliveryOtp && (
            <div className="bg-brand-light border border-brand/30 p-3.5 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-brand tracking-wider">
                  Delivery OTP Code
                </p>
                <p className="text-xl font-black text-brand tracking-widest">{order.deliveryOtp}</p>
                <p className="text-[10px] text-text-secondary">Share with delivery partner at door</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order Progress Timeline */}
      <div className="bg-white rounded-3xl border border-border p-6 shadow-xs mb-8">
        <h3 className="font-bold text-base text-text-primary mb-6">Delivery Progress</h3>

        {isCancelled ? (
          <div className="p-4 bg-red-50 rounded-2xl border border-red-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-red-900">Order Cancelled</h4>
              <p className="text-xs text-red-700 mt-0.5">
                A full refund has been initiated back to your original payment method via Razorpay.
              </p>
            </div>
          </div>
        ) : (
          <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
            {/* Step 1: Placed */}
            <div className="relative flex items-start gap-4">
              <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-success text-white flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-text-primary">Order Placed & Paid</h4>
                <p className="text-xs text-text-secondary">
                  Payment confirmed securely via Razorpay
                </p>
              </div>
            </div>

            {/* Step 2: Merchant Acceptance */}
            <div className="relative flex items-start gap-4">
              <div
                className={`absolute -left-6 mt-1 w-5 h-5 rounded-full flex items-center justify-center ${
                  getStepStatus(FulfillmentState.ACCEPTED) === "COMPLETED"
                    ? "bg-success text-white"
                    : getStepStatus(FulfillmentState.AWAITING_MERCHANT) === "CURRENT"
                    ? "bg-brand text-white animate-pulse"
                    : "bg-surface-muted text-text-secondary border border-border"
                }`}
              >
                <Store className="w-3 h-3" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-text-primary">
                  {order.fulfillmentState === FulfillmentState.AWAITING_MERCHANT
                    ? "Restaurant reviewing order (90s SLA)"
                    : "Order Accepted by Kitchen"}
                </h4>
                <p className="text-xs text-text-secondary">
                  {order.fulfillmentState === FulfillmentState.AWAITING_MERCHANT
                    ? "Restaurant manager is acknowledging your order"
                    : "Chef has accepted your ticket and assigned preparation time"}
                </p>
              </div>
            </div>

            {/* Step 3: Kitchen Preparing */}
            <div className="relative flex items-start gap-4">
              <div
                className={`absolute -left-6 mt-1 w-5 h-5 rounded-full flex items-center justify-center ${
                  getStepStatus(FulfillmentState.READY_FOR_PICKUP) === "COMPLETED"
                    ? "bg-success text-white"
                    : order.fulfillmentState === FulfillmentState.PREPARING
                    ? "bg-brand text-white animate-pulse"
                    : "bg-surface-muted text-text-secondary border border-border"
                }`}
              >
                <Clock className="w-3 h-3" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-text-primary">
                  {order.fulfillmentState === FulfillmentState.READY_FOR_PICKUP
                    ? "Food Packaged & Ready for Pickup"
                    : "Fresh Cooking in Progress"}
                </h4>
                <p className="text-xs text-text-secondary">
                  Ingredients freshly prepared in accordance with FSSAI hygiene standards
                </p>
              </div>
            </div>

            {/* Step 4: Out for Delivery */}
            <div className="relative flex items-start gap-4">
              <div
                className={`absolute -left-6 mt-1 w-5 h-5 rounded-full flex items-center justify-center ${
                  isDelivered
                    ? "bg-success text-white"
                    : order.fulfillmentState === FulfillmentState.OUT_FOR_DELIVERY
                    ? "bg-brand text-white animate-pulse"
                    : "bg-surface-muted text-text-secondary border border-border"
                }`}
              >
                <Bike className="w-3 h-3" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-text-primary">
                  {isDelivered
                    ? "Delivered Safely"
                    : order.fulfillmentState === FulfillmentState.OUT_FOR_DELIVERY
                    ? "Delivery Partner on the Way"
                    : "Delivery Partner Assigned"}
                </h4>
                <p className="text-xs text-text-secondary">
                  {isDelivered
                    ? "Enjoy your hot and delicious meal!"
                    : "Amit Kumar is delivering your meal on motorcycle"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order Item Details & Address Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Items Summary */}
        <div className="bg-white rounded-3xl border border-border p-6 shadow-xs">
          <h3 className="font-bold text-sm text-text-primary mb-3">Order Summary</h3>
          <div className="space-y-2 text-xs divide-y divide-border">
            {order.items.map((i, idx) => (
              <div key={idx} className="pt-2 flex items-center justify-between">
                <div>
                  <span className="font-bold text-text-primary">
                    {i.quantity} × {i.name}
                  </span>
                  {i.variantName && (
                    <span className="text-text-secondary text-[11px] block">
                      ({i.variantName})
                    </span>
                  )}
                </div>
                <span className="font-bold text-text-primary">
                  ₹{(i.lineTotalPaise / 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs font-black text-text-primary">
            <span>Total Paid (incl. Taxes & Delivery)</span>
            <span className="text-brand text-sm">
              ₹{(order.breakdown.payablePaise / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Delivery Address Card */}
        <div className="bg-white rounded-3xl border border-border p-6 shadow-xs">
          <h3 className="font-bold text-sm text-text-primary mb-3 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-brand" />
            <span>Delivery Destination</span>
          </h3>
          <p className="font-bold text-xs text-text-primary">{order.deliveryAddress.building}</p>
          <p className="text-xs text-text-secondary mt-0.5">{order.deliveryAddress.street}</p>
          {order.deliveryAddress.landmark && (
            <p className="text-[11px] text-text-secondary mt-1">
              Landmark: {order.deliveryAddress.landmark}
            </p>
          )}

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center">
                <Phone className="w-4 h-4 text-text-secondary" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Delivery Support</p>
                <p className="text-[10px] text-text-secondary">24x7 Help Center</p>
              </div>
            </div>
            <button
              onClick={() => alert("Our customer support executive is reviewing your order.")}
              className="px-3 py-1.5 bg-surface-muted border border-border hover:bg-white text-xs font-bold rounded-xl text-text-primary"
            >
              Get Help
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

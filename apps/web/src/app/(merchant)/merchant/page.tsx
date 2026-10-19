"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Store,
  Clock,
  CheckCircle2,
  XCircle,
  ChefHat,
  PackageCheck,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Volume2,
} from "lucide-react";
import { FulfillmentState, OrderDetailDto, DEMO_IDS } from "@startup/contracts";
import { createApiClient } from "@/lib/api-client";

export default function MerchantConsolePage() {
  const [orders, setOrders] = useState<OrderDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrepMinutes, setSelectedPrepMinutes] = useState(25);
  const [isAccepting, setIsAccepting] = useState(true);

  const fetchOrders = async () => {
    try {
      const client = createApiClient();
      const list = await client.getMerchantOrders(DEMO_IDS.restaurant1Id);
      setOrders(list);
    } catch (err) {
      console.error("Failed to fetch merchant orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAccept = async (orderId: string) => {
    try {
      const client = createApiClient();
      await client.merchantAcceptOrder(orderId, selectedPrepMinutes);
      await fetchOrders();
    } catch (err: any) {
      alert(`Accept failed: ${err.message}`);
    }
  };

  const handleReject = async (orderId: string) => {
    const reason = prompt("Enter reason for rejection (e.g. Kitchen overloaded, item out of stock):");
    if (!reason) return;
    try {
      const client = createApiClient();
      await client.merchantRejectOrder(orderId, reason);
      await fetchOrders();
    } catch (err: any) {
      alert(`Reject failed: ${err.message}`);
    }
  };

  const handleMarkPreparing = async (orderId: string) => {
    try {
      const client = createApiClient();
      await client.merchantMarkPreparing(orderId);
      await fetchOrders();
    } catch (err: any) {
      alert(`Mark preparing failed: ${err.message}`);
    }
  };

  const handleMarkReady = async (orderId: string) => {
    try {
      const client = createApiClient();
      await client.merchantMarkReady(orderId);
      await fetchOrders();
    } catch (err: any) {
      alert(`Mark ready failed: ${err.message}`);
    }
  };

  const incomingOrders = orders.filter((o) => o.fulfillmentState === FulfillmentState.AWAITING_MERCHANT);
  const activeOrders = orders.filter(
    (o) =>
      o.fulfillmentState === FulfillmentState.ACCEPTED ||
      o.fulfillmentState === FulfillmentState.PREPARING ||
      o.fulfillmentState === FulfillmentState.READY_FOR_PICKUP
  );
  const completedOrders = orders.filter(
    (o) =>
      o.fulfillmentState === FulfillmentState.OUT_FOR_DELIVERY ||
      o.fulfillmentState === FulfillmentState.DELIVERED
  );

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Top Navigation */}
      <header className="bg-white border-b border-border sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-brand"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Marketplace</span>
            </Link>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-brand" />
              <h1 className="font-black text-base text-text-primary">
                Punjabi Angithi — Kitchen Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAccepting(!isAccepting)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                isAccepting
                  ? "bg-success-light text-success border-success"
                  : "bg-red-50 text-red-600 border-red-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>{isAccepting ? "Accepting Orders (Online)" : "Paused (Offline)"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Merchant Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Section 1: Incoming Urgent Orders (Awaiting 90s SLA) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-text-primary tracking-tight">
                New Incoming Orders
              </h2>
              {incomingOrders.length > 0 && (
                <span className="px-2 py-0.5 bg-brand text-white text-xs font-bold rounded-full animate-bounce">
                  {incomingOrders.length} Urgent
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary">90s SLA Acceptance Deadline</p>
          </div>

          {incomingOrders.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-border text-xs text-text-secondary">
              No new orders waiting. Orders will chime and appear here in real-time.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {incomingOrders.map((o) => (
                <div
                  key={o.orderId}
                  className="bg-white rounded-3xl border-2 border-brand p-6 shadow-xl space-y-4 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <span className="text-xs font-bold text-text-secondary uppercase">
                        Order #{o.orderNumber}
                      </span>
                      <p className="text-sm font-black text-text-primary">
                        Total Value: ₹{(o.breakdown.payablePaise / 100).toFixed(0)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-xl text-xs font-black border border-amber-200 animate-pulse">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Review SLA: 90s</span>
                    </div>
                  </div>

                  {/* Items Ticket */}
                  <div className="space-y-2">
                    {o.items.map((i, idx) => (
                      <div key={idx} className="text-xs flex items-center justify-between">
                        <span className="font-bold text-text-primary">
                          {i.quantity} × {i.name}
                        </span>
                        <span className="text-text-secondary">
                          {i.selectedOptionNames.join(", ") || ""}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Prep Time Slider */}
                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                    <span className="font-bold text-text-secondary">Prep Time:</span>
                    <div className="flex items-center gap-1.5">
                      {[15, 25, 35].map((mins) => (
                        <button
                          key={mins}
                          onClick={() => setSelectedPrepMinutes(mins)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                            selectedPrepMinutes === mins
                              ? "bg-brand text-white"
                              : "bg-surface-muted text-text-secondary border border-border"
                          }`}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accept / Reject Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleReject(o.orderId)}
                      className="flex-1 py-3 bg-surface-muted hover:bg-red-50 hover:text-red-600 text-text-secondary text-xs font-bold rounded-2xl border border-border transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => handleAccept(o.orderId)}
                      className="flex-1 py-3 bg-brand hover:bg-brand-hover text-white text-xs font-black rounded-2xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept Ticket ({selectedPrepMinutes}m)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Active Kitchen Queue (Accepted / Preparing / Ready) */}
        <div>
          <h2 className="text-lg font-black text-text-primary tracking-tight mb-4">
            Active Kitchen Queue ({activeOrders.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeOrders.map((o) => (
              <div
                key={o.orderId}
                className="bg-white rounded-3xl border border-border p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <span className="text-xs font-bold text-text-secondary">
                      #{o.orderNumber}
                    </span>
                    <h3 className="text-sm font-bold text-text-primary mt-0.5">
                      {o.fulfillmentState.replace(/_/g, " ")}
                    </h3>
                  </div>

                  <span className="text-xs font-black text-text-primary">
                    ₹{(o.breakdown.payablePaise / 100).toFixed(0)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-text-secondary">
                  {o.items.map((i, idx) => (
                    <div key={idx}>
                      <span className="font-bold text-text-primary">
                        {i.quantity} × {i.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* State Progression Action */}
                <div className="pt-3 border-t border-border">
                  {o.fulfillmentState === FulfillmentState.ACCEPTED && (
                    <button
                      onClick={() => handleMarkPreparing(o.orderId)}
                      className="w-full py-2.5 bg-brand-light text-brand hover:bg-brand hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ChefHat className="w-4 h-4" />
                      <span>Mark Cooking / Preparing</span>
                    </button>
                  )}

                  {o.fulfillmentState === FulfillmentState.PREPARING && (
                    <button
                      onClick={() => handleMarkReady(o.orderId)}
                      className="w-full py-2.5 bg-success text-white hover:bg-emerald-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span>Mark Food Ready for Pickup</span>
                    </button>
                  )}

                  {o.fulfillmentState === FulfillmentState.READY_FOR_PICKUP && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-center text-xs font-bold">
                      Awaiting Rider Pickup Handshake
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

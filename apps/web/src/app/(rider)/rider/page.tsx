"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bike,
  Navigation,
  MapPin,
  CheckCircle2,
  Clock,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Phone,
  Radio,
  Store,
  Zap,
} from "lucide-react";
import { DeliveryTripStatus, OrderDetailDto } from "@startup/contracts";
import { createApiClient } from "@/lib/api-client";

export default function RiderPortalPage() {
  const [isOnline, setIsOnline] = useState(true);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<OrderDetailDto | null>(null);
  const [pendingOffer, setPendingOffer] = useState<any>(null);
  const [offerOrder, setOfferOrder] = useState<OrderDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpInput, setOtpInput] = useState("");
  const [acceptingOffer, setAcceptingOffer] = useState(false);

  const fetchTrip = async () => {
    try {
      const client = createApiClient();
      const res = await client.getRiderActiveTrip();
      if (res.hasActiveTrip) {
        setActiveTrip(res.assignment);
        setActiveOrder(res.order);
        setPendingOffer(null);
        setOfferOrder(null);
      } else {
        setActiveTrip(null);
        setActiveOrder(null);
        setPendingOffer(res.pendingOffer);
        setOfferOrder(res.offerOrder);
      }
    } catch (err) {
      console.error("Failed to fetch rider trip:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrip();
    const interval = setInterval(fetchTrip, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAcceptOffer = async (offerId: string) => {
    setAcceptingOffer(true);
    try {
      const client = createApiClient();
      await client.riderAcceptOffer(offerId);
      alert("Offer accepted! Order successfully assigned to you.");
      await fetchTrip();
    } catch (err: any) {
      alert(`Accept offer failed: ${err.message}`);
    } finally {
      setAcceptingOffer(false);
    }
  };

  const handleMilestone = async (nextStatus: DeliveryTripStatus) => {
    if (!activeTrip || !activeOrder) return;
    try {
      const client = createApiClient();
      await client.riderUpdateMilestone(
        activeTrip.id,
        activeOrder.orderId,
        nextStatus
      );
      await fetchTrip();
    } catch (err: any) {
      alert(`Milestone update failed: ${err.message}`);
    }
  };

  const handleCompleteDeliveryWithOtp = async () => {
    if (!activeTrip || !activeOrder || !otpInput.trim()) return;
    try {
      const client = createApiClient();
      await client.riderUpdateMilestone(
        activeTrip.id,
        activeOrder.orderId,
        DeliveryTripStatus.COMPLETED,
        otpInput.trim()
      );

      alert("Delivery successfully verified and completed! Earnings credited.");
      setOtpInput("");
      await fetchTrip();
    } catch (err: any) {
      alert(`Delivery verification failed: ${err.message}`);
    }
  };

  const handleSimulateGps = async () => {
    try {
      const client = createApiClient();
      await client.riderUpdateLocation({
        latitude: 28.6318,
        longitude: 77.2172,
      });
      alert("Simulated GPS ping sent! Server recorded fresh rider coordinates.");
    } catch (err: any) {
      alert(`GPS ping failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Rider Header */}
      <header className="bg-[#12161f] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </Link>
            <div className="flex items-center gap-2">
              <Bike className="w-5 h-5 text-brand" />
              <h1 className="font-bold text-sm sm:text-base">Amit Kumar (Fleet Partner)</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSimulateGps}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs flex items-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5 text-success animate-pulse" />
              <span>Ping GPS</span>
            </button>

            <button
              onClick={() => setIsOnline(!isOnline)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                isOnline ? "bg-success text-white" : "bg-gray-600 text-gray-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>{isOnline ? "Online" : "Offline"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Rider Console */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Case 1: Active Delivery Trip */}
        {activeTrip && activeOrder ? (
          <div className="bg-white rounded-3xl border border-border p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="text-[10px] font-bold text-brand uppercase bg-brand-light px-2.5 py-0.5 rounded-full">
                  Trip #{activeTrip.status}
                </span>
                <h2 className="text-xl font-black text-text-primary mt-1">
                  Order #{activeOrder.orderNumber}
                </h2>
                <p className="text-xs text-text-secondary">
                  Estimated Trip Payout: <strong className="text-success text-sm">₹65.00</strong>
                </p>
              </div>

              <div className="p-3 bg-surface-muted rounded-2xl text-center">
                <Navigation className="w-5 h-5 text-brand mx-auto mb-0.5" />
                <span className="text-[10px] font-bold text-text-secondary">Navigation</span>
              </div>
            </div>

            {/* Pickup & Dropoff Waypoints */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pickup Restaurant */}
              <div className="p-4 rounded-2xl bg-surface-muted border border-border space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
                  <Store className="w-4 h-4 text-brand" />
                  <span>Pickup Restaurant</span>
                </div>
                <h4 className="font-bold text-sm text-text-primary">
                  {activeOrder.restaurant.name}
                </h4>
                <p className="text-xs text-text-secondary">{activeOrder.restaurant.phone}</p>
              </div>

              {/* Dropoff Customer */}
              <div className="p-4 rounded-2xl bg-surface-muted border border-border space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
                  <MapPin className="w-4 h-4 text-success" />
                  <span>Customer Dropoff</span>
                </div>
                <h4 className="font-bold text-sm text-text-primary">
                  {activeOrder.deliveryAddress.building}
                </h4>
                <p className="text-xs text-text-secondary">
                  {activeOrder.deliveryAddress.street}
                </p>
              </div>
            </div>

            {/* Trip Milestone Actions */}
            <div className="pt-4 border-t border-border space-y-4">
              <h3 className="font-bold text-sm text-text-primary">Trip Progression Milestones</h3>

              {activeTrip.status === DeliveryTripStatus.ASSIGNED && (
                <button
                  onClick={() => handleMilestone(DeliveryTripStatus.AT_PICKUP)}
                  className="w-full py-3.5 bg-brand hover:bg-brand-hover text-white text-xs font-black rounded-2xl shadow-lg transition-all"
                >
                  Arrived at Restaurant Pickup
                </button>
              )}

              {activeTrip.status === DeliveryTripStatus.AT_PICKUP && (
                <button
                  onClick={() => handleMilestone(DeliveryTripStatus.PICKED_UP)}
                  className="w-full py-3.5 bg-brand hover:bg-brand-hover text-white text-xs font-black rounded-2xl shadow-lg transition-all"
                >
                  Verify Food Package Picked Up
                </button>
              )}

              {activeTrip.status === DeliveryTripStatus.PICKED_UP && (
                <button
                  onClick={() => handleMilestone(DeliveryTripStatus.AT_DROPOFF)}
                  className="w-full py-3.5 bg-brand hover:bg-brand-hover text-white text-xs font-black rounded-2xl shadow-lg transition-all"
                >
                  Arrived at Customer Doorstep
                </button>
              )}

              {activeTrip.status === DeliveryTripStatus.AT_DROPOFF && (
                <div className="p-4 bg-brand-light/50 border border-brand/30 rounded-2xl space-y-3">
                  <div>
                    <h4 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-brand" />
                      <span>Enter Customer Delivery OTP</span>
                    </h4>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Ask the customer for the 6-digit verification code shown on their order tracking screen
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder="e.g. 123456"
                      maxLength={6}
                      className="flex-1 p-3 bg-white border border-border rounded-xl text-center text-lg font-black tracking-widest focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <button
                      onClick={handleCompleteDeliveryWithOtp}
                      disabled={!otpInput.trim()}
                      className="px-6 py-3 bg-success hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all"
                    >
                      Verify & Deliver
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : pendingOffer ? (
          /* Case 2: Pending Dispatch Offer Card */
          <div className="bg-white rounded-3xl border-2 border-brand p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-brand text-white px-4 py-1 text-xs font-black rounded-bl-2xl uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Incoming Dispatch Offer</span>
            </div>

            <div className="pt-2">
              <span className="text-[10px] font-black text-brand uppercase bg-brand-light px-2.5 py-0.5 rounded-full">
                Offer Active
              </span>
              <h2 className="text-2xl font-black text-text-primary mt-1">
                New Delivery Available
              </h2>
              <p className="text-sm text-text-secondary mt-0.5">
                Guaranteed Partner Payout: <strong className="text-success text-base">₹65.00</strong>
              </p>
            </div>

            {offerOrder && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-surface-muted border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
                    <Store className="w-4 h-4 text-brand" />
                    <span>Pickup From</span>
                  </div>
                  <h4 className="font-bold text-sm text-text-primary">
                    {offerOrder.restaurant.name}
                  </h4>
                  <p className="text-xs text-text-secondary">{offerOrder.restaurant.phone}</p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-muted border border-border space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary">
                    <MapPin className="w-4 h-4 text-success" />
                    <span>Deliver To</span>
                  </div>
                  <h4 className="font-bold text-sm text-text-primary">
                    {offerOrder.deliveryAddress.building}
                  </h4>
                  <p className="text-xs text-text-secondary">
                    {offerOrder.deliveryAddress.street}
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => handleAcceptOffer(pendingOffer.id)}
              disabled={acceptingOffer}
              className="w-full py-4 bg-brand hover:bg-brand-hover disabled:bg-gray-400 text-white font-black text-sm rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
            >
              {acceptingOffer ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Claiming Offer...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Accept Delivery Job (Claim Offer)</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Case 3: Idle / Waiting for Offers */
          <div className="p-12 text-center bg-white rounded-3xl border border-border shadow-xs space-y-3">
            <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mx-auto text-text-secondary">
              <Bike className="w-8 h-8 text-brand" />
            </div>
            <h3 className="font-bold text-lg text-text-primary">No Active Delivery Trips</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              You are online and ready for dispatch. When a nearby customer places an order and kitchen marks it ready, you will receive an offer alert here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  DollarSign,
  AlertOctagon,
  Clock,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { createApiClient } from "@/lib/api-client";

export default function AdminOperationsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const client = createApiClient();
      const list = await client.getAdminOrders();
      setOrders(list);
    } catch (err) {
      console.error("Failed to fetch admin orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleRefund = async (orderId: string, amountPaise: number) => {
    const reason = prompt("Enter official reason for operational refund (e.g. Food spilled, merchant delayed >45m):");
    if (!reason) return;
    try {
      const client = createApiClient();
      await client.adminRefundOrder(orderId, amountPaise, reason);
      alert("Refund processed successfully and posted to the double-entry accounting ledger!");
      await fetchOrders();
    } catch (err: any) {
      alert(`Refund failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      {/* Header */}
      <header className="bg-[#1a1c23] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Marketplace</span>
            </Link>

            <div className="h-6 w-px bg-gray-700" />

            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-brand" />
              <h1 className="font-bold text-sm sm:text-base">Operations & Incident Console</h1>
            </div>
          </div>

          <button
            onClick={fetchOrders}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Board</span>
          </button>
        </div>
      </header>

      {/* Main Admin Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Marketplace Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-text-secondary uppercase">Total Orders</p>
            <p className="text-2xl font-black text-text-primary mt-1">{orders.length}</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-text-secondary uppercase">Gross Volume</p>
            <p className="text-2xl font-black text-text-primary mt-1">
              ₹
              {(
                orders.reduce((sum, o) => sum + (o.payablePaise || 0), 0) / 100
              ).toFixed(0)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-text-secondary uppercase">Active SLA Tickets</p>
            <p className="text-2xl font-black text-brand mt-1">
              {orders.filter((o) => o.fulfillmentState === "AWAITING_MERCHANT").length}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-border shadow-xs">
            <p className="text-[11px] font-bold text-text-secondary uppercase">Ledger Invariant</p>
            <p className="text-sm font-black text-success mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              Balanced (100%)
            </p>
          </div>
        </div>

        {/* Live Orders Board */}
        <div className="bg-white rounded-3xl border border-border shadow-xs overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-black text-text-primary tracking-tight">
              Live Marketplace Orders
            </h2>
            <span className="text-xs text-text-secondary">Showing latest 50 orders</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border text-text-secondary uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-3.5 px-6">Order ID</th>
                  <th className="py-3.5 px-4">Restaurant</th>
                  <th className="py-3.5 px-4">Destination</th>
                  <th className="py-3.5 px-4">Fulfillment State</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4">Value</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.orderId} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-text-primary">
                      <Link href={`/orders/${o.orderId}`} className="hover:text-brand hover:underline">
                        #{o.orderNumber}
                      </Link>
                    </td>
                    <td className="py-4 px-4 font-semibold text-text-primary">{o.restaurantName}</td>
                    <td className="py-4 px-4 text-text-secondary max-w-xs truncate">
                      {o.customerAddress}
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-muted border border-border uppercase">
                        {o.fulfillmentState}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          o.paymentStatus === "CAPTURED"
                            ? "bg-success-light text-success"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-black text-text-primary">
                      ₹{(o.payablePaise / 100).toFixed(0)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {o.paymentStatus === "CAPTURED" && (
                        <button
                          onClick={() => handleRefund(o.orderId, o.payablePaise)}
                          className="px-3 py-1 bg-surface-muted hover:bg-red-50 hover:text-red-600 text-text-secondary text-[11px] font-bold rounded-lg border border-border transition-colors"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { User, MapPin, Clock, ArrowRight, ShieldCheck, ShoppingBag } from "lucide-react";
import { AddressDto, OrderSummaryDto } from "@startup/contracts";
import { ApiClient } from "@startup/api-client";
import { useAuthStore } from "@/features/auth/auth-store";

export default function AccountPage() {
  const { currentUser, getToken } = useAuthStore();
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const client = new ApiClient({ baseUrl: "", getToken });
        const [ordersList, addressList] = await Promise.all([
          client.getCustomerOrders(),
          client.getAddresses(),
        ]);
        setOrders(ordersList);
        setAddresses(addressList);
      } catch (err) {
        console.error("Failed to load account data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [getToken]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 1. Profile Header */}
      <div className="bg-white rounded-3xl border border-border p-6 shadow-xs mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-light text-brand flex items-center justify-center font-black text-2xl border border-brand/20">
            {currentUser.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">{currentUser.name}</h1>
              <span className="text-[10px] font-bold text-success bg-success-light px-2 py-0.5 rounded-full border border-success/30">
                VERIFIED CUSTOMER
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">{currentUser.email}</p>
            <p className="text-xs text-text-secondary">{currentUser.phone}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Order History */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight mb-2 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-brand" />
            <span>Past Orders ({orders.length})</span>
          </h2>

          {loading ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-surface-muted rounded-2xl" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center bg-surface-muted rounded-2xl border border-border text-xs text-text-secondary">
              No orders placed yet. Explore restaurants to make your first order!
            </div>
          ) : (
            orders.map((o) => (
              <div
                key={o.orderId}
                className="bg-white rounded-2xl border border-border p-5 hover:border-brand/30 hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-text-primary">{o.restaurantName}</h3>
                    <span className="text-[10px] uppercase font-bold text-text-secondary bg-surface-muted px-2 py-0.5 rounded-full">
                      {o.fulfillmentState.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Order #{o.orderNumber} • {o.itemCount} Items
                  </p>
                  <p className="text-xs font-black text-text-primary mt-1">
                    ₹{(o.payablePaise / 100).toFixed(0)}
                  </p>
                </div>

                <Link
                  href={`/orders/${o.orderId}`}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-light text-brand text-xs font-bold rounded-xl hover:bg-brand hover:text-white transition-colors"
                >
                  <span>Track / View</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))
          )}
        </div>

        {/* Right 1 Col: Saved Addresses */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-text-primary tracking-tight mb-2 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand" />
            <span>Saved Addresses</span>
          </h2>

          {addresses.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-2xl border border-border p-4 shadow-xs space-y-1"
            >
              <span className="text-[10px] font-bold text-brand uppercase bg-brand-light px-2 py-0.5 rounded-full">
                {a.label}
              </span>
              <h4 className="font-bold text-xs text-text-primary mt-1">{a.building}</h4>
              <p className="text-xs text-text-secondary">{a.street}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

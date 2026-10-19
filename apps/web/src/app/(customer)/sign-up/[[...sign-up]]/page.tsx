"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { User, Store, Bike, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/features/auth/auth-store";

export default function SignUpPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleSelectRole = (role: "customer" | "merchant" | "rider" | "admin", path: string) => {
    setUser(role);
    router.push(path);
  };

  return (
    <div className="max-w-md mx-auto my-16 px-4">
      <div className="bg-white rounded-3xl border border-border p-8 shadow-xl text-center space-y-6">
        <div>
          <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-3 shadow-md">
            Z
          </div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">
            Create an Account on ZomatoFresh
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Select a role to start your journey with the platform
          </p>
        </div>

        <div className="space-y-3 text-left">
          <button
            onClick={() => handleSelectRole("customer", "/")}
            className="w-full p-4 rounded-2xl border border-border hover:border-brand hover:bg-brand-light/30 transition-all flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-muted group-hover:bg-brand group-hover:text-white flex items-center justify-center text-text-secondary transition-colors">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-text-primary">New Customer</h4>
              <p className="text-xs text-text-secondary">Discover food, customize dishes & order</p>
            </div>
          </button>

          <button
            onClick={() => handleSelectRole("merchant", "/merchant")}
            className="w-full p-4 rounded-2xl border border-border hover:border-brand hover:bg-brand-light/30 transition-all flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-muted group-hover:bg-brand group-hover:text-white flex items-center justify-center text-text-secondary transition-colors">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-text-primary">Restaurant Partner</h4>
              <p className="text-xs text-text-secondary">Manage kitchen prep and incoming order alerts</p>
            </div>
          </button>

          <button
            onClick={() => handleSelectRole("rider", "/rider")}
            className="w-full p-4 rounded-2xl border border-border hover:border-brand hover:bg-brand-light/30 transition-all flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-muted group-hover:bg-brand group-hover:text-white flex items-center justify-center text-text-secondary transition-colors">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-text-primary">Delivery Fleet Partner</h4>
              <p className="text-xs text-text-secondary">Deliver orders and track earnings</p>
            </div>
          </button>

          <button
            onClick={() => handleSelectRole("admin", "/admin")}
            className="w-full p-4 rounded-2xl border border-border hover:border-brand hover:bg-brand-light/30 transition-all flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-muted group-hover:bg-brand group-hover:text-white flex items-center justify-center text-text-secondary transition-colors">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-text-primary">Operations Manager</h4>
              <p className="text-xs text-text-secondary">Access internal operations, monitoring & ledger</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

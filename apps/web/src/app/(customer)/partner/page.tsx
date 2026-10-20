"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, CheckCircle2, Clock, Store, XCircle } from "lucide-react";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { timeAgo } from "@/lib/format";

const input = "mt-1 w-full p-3 bg-surface-muted border border-border rounded-xl text-sm";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-xs font-semibold text-text-secondary">
      {label}
      {children}
      {hint && <span className="block text-[11px] font-normal mt-0.5">{hint}</span>}
    </label>
  );
}

function useSubmit(type: "MERCHANT" | "RIDER") {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const submit = async (details: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.submitApplication(type, details);
      toast("Application submitted. We'll review it within 2 working days.", "success");
      queryClient.invalidateQueries({ queryKey: ["my-applications"] });
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, submit };
}

function RestaurantForm() {
  const toast = useToast();
  const { busy, submit } = useSubmit("MERCHANT");
  const [f, setF] = useState({
    legalBusinessName: "",
    restaurantName: "",
    fssaiLicenseNumber: "",
    gstin: "",
    pan: "",
    contactPhone: "",
    contactEmail: "",
    addressText: "",
    cuisines: "",
    pureVeg: false,
    avgPrice: "300",
  });
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!location) {
          toast("Pin the restaurant's location first (stand at the outlet and tap the button).", "error");
          return;
        }
        submit({
          legalBusinessName: f.legalBusinessName,
          restaurantName: f.restaurantName,
          fssaiLicenseNumber: f.fssaiLicenseNumber,
          gstin: f.gstin || undefined,
          pan: f.pan,
          contactPhone: f.contactPhone,
          contactEmail: f.contactEmail,
          addressText: f.addressText,
          location,
          cuisines: f.cuisines.split(",").map((c) => c.trim()).filter(Boolean),
          pureVeg: f.pureVeg,
          avgPriceForOnePaise: Math.round(Number(f.avgPrice) * 100),
        });
      }}
      className="grid sm:grid-cols-2 gap-3"
    >
      <Field label="Restaurant name *"><input required value={f.restaurantName} onChange={set("restaurantName")} className={input} /></Field>
      <Field label="Legal business name *"><input required value={f.legalBusinessName} onChange={set("legalBusinessName")} className={input} /></Field>
      <Field label="FSSAI licence number *" hint="14 digits"><input required inputMode="numeric" value={f.fssaiLicenseNumber} onChange={set("fssaiLicenseNumber")} className={input} /></Field>
      <Field label="PAN *"><input required value={f.pan} onChange={set("pan")} className={`${input} uppercase`} /></Field>
      <Field label="GSTIN" hint="Optional if not GST-registered"><input value={f.gstin} onChange={set("gstin")} className={`${input} uppercase`} /></Field>
      <Field label="Contact mobile *"><input required inputMode="tel" value={f.contactPhone} onChange={set("contactPhone")} className={input} /></Field>
      <Field label="Contact email *"><input required type="email" value={f.contactEmail} onChange={set("contactEmail")} className={input} /></Field>
      <Field label="Cuisines *" hint="Comma separated, e.g. North Indian, Biryani"><input required value={f.cuisines} onChange={set("cuisines")} className={input} /></Field>
      <Field label="Average price for one (₹) *"><input required inputMode="numeric" value={f.avgPrice} onChange={set("avgPrice")} className={input} /></Field>
      <div className="sm:col-span-2">
        <Field label="Full address *"><input required value={f.addressText} onChange={set("addressText")} className={input} /></Field>
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            try {
              const p = await getCurrentPosition();
              setLocation({ latitude: p.latitude, longitude: p.longitude });
            } catch (err) {
              toast(errorMessage(err), "error");
            }
          }}
          className="px-4 py-2.5 rounded-xl border border-border text-sm font-bold"
        >
          {location ? "Location pinned ✓" : "Pin outlet location"}
        </button>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={f.pureVeg} onChange={set("pureVeg")} className="w-4 h-4" /> Pure veg
        </label>
      </div>
      <button disabled={busy} className="sm:col-span-2 py-3 rounded-xl bg-brand text-white font-bold flex items-center justify-center gap-2">
        {busy && <Spinner />} Submit application
      </button>
    </form>
  );
}

function RiderForm() {
  const { busy, submit } = useSubmit("RIDER");
  const [f, setF] = useState({ fullName: "", phone: "", vehicleType: "MOTORCYCLE", vehicleNumber: "", drivingLicenseNumber: "", city: "New Delhi" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const motorised = f.vehicleType !== "BICYCLE";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          ...f,
          vehicleNumber: motorised ? f.vehicleNumber.replace(/\s/g, "") : undefined,
          drivingLicenseNumber: motorised ? f.drivingLicenseNumber.replace(/\s/g, "") : undefined,
        });
      }}
      className="grid sm:grid-cols-2 gap-3"
    >
      <Field label="Full name (as on ID) *"><input required value={f.fullName} onChange={set("fullName")} className={input} /></Field>
      <Field label="Mobile number *"><input required inputMode="tel" value={f.phone} onChange={set("phone")} className={input} /></Field>
      <Field label="Vehicle *">
        <select value={f.vehicleType} onChange={set("vehicleType")} className={input}>
          <option value="MOTORCYCLE">Motorcycle</option>
          <option value="SCOOTER">Scooter</option>
          <option value="EV_SCOOTER">Electric scooter</option>
          <option value="BICYCLE">Bicycle</option>
        </select>
      </Field>
      <Field label="City *"><input required value={f.city} onChange={set("city")} className={input} /></Field>
      {motorised && (
        <>
          <Field label="Vehicle registration number *"><input required value={f.vehicleNumber} onChange={set("vehicleNumber")} className={`${input} uppercase`} /></Field>
          <Field label="Driving licence number *"><input required value={f.drivingLicenseNumber} onChange={set("drivingLicenseNumber")} className={`${input} uppercase`} /></Field>
        </>
      )}
      <button disabled={busy} className="sm:col-span-2 py-3 rounded-xl bg-brand text-white font-bold flex items-center justify-center gap-2">
        {busy && <Spinner />} Submit application
      </button>
    </form>
  );
}

function PartnerContent() {
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const type = params.get("type") === "rider" ? "rider" : "restaurant";
  const mine = useQuery({ queryKey: ["my-applications"], queryFn: () => api.getMyApplications(), enabled: isSignedIn });

  if (isLoaded && !isSignedIn) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <EmptyState title="Sign in to apply" body="Use the account you'll use to manage your restaurant or deliveries." action={<Link href={`/sign-in?redirect_url=/partner?type=${type}`} className="inline-block px-5 py-2.5 bg-brand text-white text-xs font-bold rounded-xl">Sign in</Link>} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-black">Partner with ZomatoFresh</h1>
      <div className="grid grid-cols-2 gap-3">
        {([
          ["restaurant", "Add your restaurant", "Reach customers nearby. Weekly payouts.", Store],
          ["rider", "Deliver with us", "Flexible hours. 100% of tips. Weekly payouts.", Bike],
        ] as const).map(([key, title, body, Icon]) => (
          <button key={key} onClick={() => router.replace(`/partner?type=${key}`)} className={`text-left p-4 rounded-2xl border-2 ${type === key ? "border-brand bg-brand-light/40" : "border-border"}`}>
            <Icon className="w-6 h-6 text-brand" />
            <p className="font-bold mt-2">{title}</p>
            <p className="text-xs text-text-secondary">{body}</p>
          </button>
        ))}
      </div>

      {(mine.data?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-bold mb-2">Your applications</h2>
          <ul className="space-y-2">
            {mine.data!.map((a) => (
              <li key={a.id} className="p-3 rounded-xl border border-border flex items-center gap-3 text-sm">
                {a.status === "APPROVED" ? <CheckCircle2 className="w-5 h-5 text-success" /> : a.status === "REJECTED" ? <XCircle className="w-5 h-5 text-red-600" /> : <Clock className="w-5 h-5 text-amber-600" />}
                <div className="flex-1">
                  <p className="font-semibold">
                    {a.type === "MERCHANT" ? a.details.restaurantName : "Delivery partner"} · {a.status.toLowerCase()}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Submitted {timeAgo(a.createdAt)}
                    {a.reviewNote && ` · ${a.reviewNote}`}
                  </p>
                </div>
                {a.status === "APPROVED" && (
                  <Link href={a.type === "MERCHANT" ? "/merchant" : "/rider"} className="text-xs font-bold text-brand">
                    Open {a.type === "MERCHANT" ? "console" : "app"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="p-5 rounded-3xl border border-border">
        {type === "restaurant" ? <RestaurantForm /> : <RiderForm />}
        <p className="text-[11px] text-text-secondary mt-3">
          By applying you agree to our <Link href="/legal/terms" className="underline">terms</Link>. Bank details for payouts are added after approval.
        </p>
      </section>
    </div>
  );
}

export default function PartnerPage() {
  return (
    <Suspense>
      <PartnerContent />
    </Suspense>
  );
}

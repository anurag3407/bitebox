"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Check, CheckCircle2, Clock, LocateFixed, Store, XCircle } from "lucide-react";
import { Field } from "@/components/ui/field";
import { EmptyState, PageSpinner, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/auth-context";
import { errorMessage, useApi } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { timeAgo } from "@/lib/format";

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
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!location) {
          toast("Pin your outlet's location first. Stand at the outlet and tap “Pin location”.", "error");
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
          cuisines: f.cuisines
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          pureVeg: f.pureVeg,
          avgPriceForOnePaise: Math.round(Number(f.avgPrice) * 100),
        });
      }}
      className="space-y-12"
    >
      <fieldset className="grid gap-6 sm:grid-cols-2">
        <legend className="mb-6 text-base font-semibold text-ink">Your restaurant</legend>
        <Field label="Restaurant name">
          <input required value={f.restaurantName} onChange={set("restaurantName")} className="input" />
        </Field>
        <Field label="Cuisines" hint="Comma separated, e.g. North Indian, Biryani">
          <input required value={f.cuisines} onChange={set("cuisines")} className="input" />
        </Field>
        <Field label="Average price for one (₹)">
          <input required inputMode="numeric" value={f.avgPrice} onChange={set("avgPrice")} className="input" />
        </Field>
        <label className="flex items-center gap-3 self-end pb-3.5 text-[15px] text-ink">
          <input type="checkbox" checked={f.pureVeg} onChange={set("pureVeg")} className="checkbox" /> Pure veg kitchen
        </label>
        <Field label="Full address" className="sm:col-span-2">
          <input required value={f.addressText} onChange={set("addressText")} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <button
            type="button"
            disabled={locating}
            onClick={async () => {
              setLocating(true);
              try {
                const p = await getCurrentPosition();
                setLocation({ latitude: p.latitude, longitude: p.longitude });
              } catch (err) {
                toast(errorMessage(err), "error");
              } finally {
                setLocating(false);
              }
            }}
            className={`btn ${location ? "btn-secondary" : "btn-outline"}`}
          >
            {locating ? <Spinner /> : location ? <Check className="h-4 w-4 text-success" /> : <LocateFixed className="h-4 w-4" />}
            {location ? "Location pinned" : "Pin outlet location"}
          </button>
          <span className="hint">Stand at the outlet when you tap this. Delivery partners navigate to this point.</span>
        </div>
      </fieldset>

      <fieldset className="grid gap-6 sm:grid-cols-2">
        <legend className="mb-6 text-base font-semibold text-ink">Business & contact</legend>
        <Field label="Legal business name">
          <input required value={f.legalBusinessName} onChange={set("legalBusinessName")} className="input" />
        </Field>
        <Field label="FSSAI licence number" hint="14 digits">
          <input required inputMode="numeric" value={f.fssaiLicenseNumber} onChange={set("fssaiLicenseNumber")} className="input" />
        </Field>
        <Field label="PAN">
          <input required value={f.pan} onChange={set("pan")} className="input uppercase" />
        </Field>
        <Field label="GSTIN" hint="Optional if you're not GST-registered">
          <input value={f.gstin} onChange={set("gstin")} className="input uppercase" />
        </Field>
        <Field label="Contact mobile">
          <input required inputMode="tel" value={f.contactPhone} onChange={set("contactPhone")} className="input" />
        </Field>
        <Field label="Contact email">
          <input required type="email" value={f.contactEmail} onChange={set("contactEmail")} className="input" />
        </Field>
      </fieldset>

      <button disabled={busy} className="btn btn-primary btn-lg w-full sm:w-auto">
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
      className="space-y-12"
    >
      <fieldset className="grid gap-6 sm:grid-cols-2">
        <legend className="mb-6 text-base font-semibold text-ink">About you</legend>
        <Field label="Full name" hint="As on your ID">
          <input required value={f.fullName} onChange={set("fullName")} className="input" />
        </Field>
        <Field label="Mobile number">
          <input required inputMode="tel" value={f.phone} onChange={set("phone")} className="input" />
        </Field>
        <Field label="City">
          <input required value={f.city} onChange={set("city")} className="input" />
        </Field>
        <Field label="Vehicle">
          <select value={f.vehicleType} onChange={set("vehicleType")} className="input">
            <option value="MOTORCYCLE">Motorcycle</option>
            <option value="SCOOTER">Scooter</option>
            <option value="EV_SCOOTER">Electric scooter</option>
            <option value="BICYCLE">Bicycle</option>
          </select>
        </Field>
        {motorised && (
          <>
            <Field label="Vehicle registration number">
              <input required value={f.vehicleNumber} onChange={set("vehicleNumber")} className="input uppercase" />
            </Field>
            <Field label="Driving licence number">
              <input required value={f.drivingLicenseNumber} onChange={set("drivingLicenseNumber")} className="input uppercase" />
            </Field>
          </>
        )}
      </fieldset>
      <button disabled={busy} className="btn btn-primary btn-lg w-full sm:w-auto">
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

  if (!isLoaded) return <PageSpinner />;
  if (!isSignedIn) {
    return (
      <EmptyState
        icon={type === "rider" ? <Bike /> : <Store />}
        title="Sign in to apply"
        body="Use the account you'll manage your restaurant or deliveries with."
        action={
          <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/partner?type=${type}`)}`} className="btn btn-primary">
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="page-narrow pb-16 pt-10 sm:pt-16">
      <p className="eyebrow">Partner with BiteBox</p>
      <h1 className="h-page mt-3">Grow with us</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">Weekly payouts, transparent fees, and a team that picks up the phone.</p>

      <div className="mt-10 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Partner type">
        {(
          [
            ["restaurant", "List your restaurant", "Reach customers nearby", Store],
            ["rider", "Deliver with us", "Flexible hours, 100% of tips", Bike],
          ] as const
        ).map(([key, title, body, Icon]) => (
          <button
            key={key}
            role="radio"
            aria-checked={type === key}
            onClick={() => router.replace(`/partner?type=${key}`, { scroll: false })}
            className={`rounded-3xl border p-5 text-left transition-colors sm:p-6 ${type === key ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink/40"}`}
          >
            <Icon className="h-6 w-6 text-ink" strokeWidth={1.6} />
            <p className="mt-5 font-medium text-ink">{title}</p>
            <p className="mt-1 text-sm text-ink-muted">{body}</p>
          </button>
        ))}
      </div>

      {(mine.data?.length ?? 0) > 0 && (
        <section className="mt-12">
          <h2 className="text-base font-semibold text-ink">Your applications</h2>
          <ul className="rows mt-3">
            {mine.data!.map((a) => (
              <li key={a.id} className="flex items-center gap-4 py-4">
                {a.status === "APPROVED" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : a.status === "REJECTED" ? (
                  <XCircle className="h-5 w-5 shrink-0 text-danger" />
                ) : (
                  <Clock className="h-5 w-5 shrink-0 text-warn" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {a.type === "MERCHANT" ? a.details.restaurantName : "Delivery partner"}{" "}
                    <span className="font-normal capitalize text-ink-muted">· {a.status.toLowerCase()}</span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    Submitted {timeAgo(a.createdAt)}
                    {a.reviewNote && ` · ${a.reviewNote}`}
                  </p>
                </div>
                {a.status === "APPROVED" && (
                  <Link href={a.type === "MERCHANT" ? "/merchant" : "/rider"} className="btn btn-outline btn-sm">
                    Open {a.type === "MERCHANT" ? "console" : "app"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-14 border-t border-line pt-12">
        {type === "restaurant" ? <RestaurantForm /> : <RiderForm />}
        <p className="mt-6 text-sm text-ink-muted">
          By applying you agree to our{" "}
          <Link href="/legal/terms" className="link">
            terms
          </Link>
          . You&apos;ll add bank details for payouts after approval.
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

"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag } from "lucide-react";
import type { MerchantCouponDto } from "@startup/api-client";
import { Field, MoneyInput, Toggle } from "@/components/ui/field";
import { EmptyState, Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

function offerLabel(coupon: MerchantCouponDto): string {
  if (coupon.type === "FREE_DELIVERY") return "Free delivery";
  if (coupon.type === "FLAT") return `${formatRupees(coupon.discountValue)} off`;
  return `${coupon.discountValue}% off${coupon.maxDiscountPaise ? ` up to ${formatRupees(coupon.maxDiscountPaise)}` : ""}`;
}

export function PromotionsPanel({ restaurantId }: { restaurantId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const coupons = useQuery({ queryKey: ["merchant-coupons", restaurantId], queryFn: () => api.getMerchantCoupons(restaurantId) });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<MerchantCouponDto["type"]>("PERCENTAGE");
  const [percent, setPercent] = useState("20");
  const [flatPaise, setFlatPaise] = useState(10_000);
  const [maxDiscountPaise, setMaxDiscountPaise] = useState(5_000);
  const [minOrderPaise, setMinOrderPaise] = useState(19_900);
  const [description, setDescription] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api.createMerchantCoupon(restaurantId, {
        code,
        type,
        discountValue: type === "PERCENTAGE" ? Number(percent) : type === "FLAT" ? flatPaise : 0,
        maxDiscountPaise: type === "PERCENTAGE" ? maxDiscountPaise : undefined,
        minOrderPaise,
        description: description.trim() || undefined,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        usageLimitTotal: usageLimit ? Number(usageLimit) : undefined,
        firstOrderOnly,
      });
      await queryClient.invalidateQueries({ queryKey: ["merchant-coupons", restaurantId] });
      toast("Offer created", "success");
      setOpen(false);
      setCode("");
      setDescription("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (coupon: MerchantCouponDto) => {
    try {
      await api.setMerchantCouponActive(restaurantId, coupon.id, !coupon.isActive);
      await queryClient.invalidateQueries({ queryKey: ["merchant-coupons", restaurantId] });
      toast(coupon.isActive ? "Offer paused" : "Offer resumed", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (coupons.isPending) return <div className="skeleton h-40" />;
  const list = coupons.data ?? [];
  const active = list.filter((c) => c.isActive).length;
  const redeemed = list.reduce((sum, c) => sum + c.redeemedCount, 0);

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl bg-subtle p-5">
          <p className="text-[13px] text-ink-muted">Offers</p>
          <p className="mt-2 text-2xl font-semibold text-ink tabular">{list.length}</p>
        </div>
        <div className="rounded-3xl bg-subtle p-5">
          <p className="text-[13px] text-ink-muted">Live</p>
          <p className="mt-2 text-2xl font-semibold text-ink tabular">{active}</p>
        </div>
        <div className="rounded-3xl bg-subtle p-5">
          <p className="text-[13px] text-ink-muted">Redeemed</p>
          <p className="mt-2 text-2xl font-semibold text-ink tabular">{redeemed}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your offers</h2>
          <p className="mt-1 text-sm text-ink-muted">Shown to customers on your storefront and at checkout.</p>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="btn btn-primary btn-sm">
          <Plus className="h-4 w-4" /> New offer
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-5 rounded-3xl border border-line p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" hint="4–20 letters or numbers">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
                className="input uppercase"
                placeholder="SAVE20"
              />
            </Field>
            <Field label="Offer type">
              <select value={type} onChange={(e) => setType(e.target.value as MerchantCouponDto["type"])} className="input">
                <option value="PERCENTAGE">Percentage off</option>
                <option value="FLAT">Flat amount off</option>
                <option value="FREE_DELIVERY">Free delivery</option>
              </select>
            </Field>
            {type === "PERCENTAGE" && (
              <>
                <Field label="Percent off" hint="1–100">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Maximum discount (₹)">
                  <MoneyInput paise={maxDiscountPaise} onChange={setMaxDiscountPaise} ariaLabel="Maximum discount" />
                </Field>
              </>
            )}
            {type === "FLAT" && (
              <Field label="Amount off (₹)">
                <MoneyInput paise={flatPaise} onChange={setFlatPaise} ariaLabel="Discount amount" />
              </Field>
            )}
            <Field label="Minimum order (₹)">
              <MoneyInput paise={minOrderPaise} onChange={setMinOrderPaise} ariaLabel="Minimum order" />
            </Field>
            <Field label="Valid until" hint="Leave blank for no expiry">
              <input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input" />
            </Field>
            <Field label="Total uses" hint="Optional overall cap">
              <input
                type="number"
                min={1}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={140}
                className="input"
                placeholder="20% off on all biryanis"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-ink">First order only</span>
            <Toggle label="First order only" checked={firstOrderOnly} onChange={setFirstOrderOnly} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button disabled={busy || code.length < 4} onClick={create} className="btn btn-primary flex-[2]">
              {busy && <Spinner />} Create offer
            </button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Funded spend" value={formatRupees(list.reduce((sum, c) => sum + c.fundedSpendPaise, 0))} sub="Merchant-funded discounts" />
          <Stat label="Attributed revenue" value={formatRupees(list.reduce((sum, c) => sum + c.attributedRevenuePaise, 0))} sub="Delivered food value" />
          <Stat
            label="Return"
            value={`${(list.reduce((sum, c) => sum + c.attributedRevenuePaise, 0) / Math.max(1, list.reduce((sum, c) => sum + c.fundedSpendPaise, 0))).toFixed(1)}×`}
            sub="Revenue per ₹1 funded"
          />
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={<Tag />} title="No offers yet" body="Create a coupon to bring customers back." />
      ) : (
        <ul className="mt-6 divide-y divide-line">
          {list.map((coupon) => (
            <li key={coupon.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle">
                  <Tag className="h-4 w-4 text-ink" />
                </span>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    {coupon.code}
                    <span className={`badge ${coupon.isActive ? "badge-success" : "badge-neutral"}`}>
                      {coupon.isActive ? "live" : "paused"}
                    </span>
                    <span className="badge badge-neutral">Merchant-funded</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {offerLabel(coupon)} · min {formatRupees(coupon.minOrderPaise)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {coupon.redeemedCount} redeemed
                    {coupon.usageLimitTotal ? ` of ${coupon.usageLimitTotal}` : ""}
                    {coupon.validUntil ? ` · ends ${formatDateTime(coupon.validUntil)}` : ""}
                    {coupon.fundedSpendPaise > 0 ? ` · ${formatRupees(coupon.fundedSpendPaise)} funded` : ""}
                    {coupon.attributedRevenuePaise > 0 ? ` · ${formatRupees(coupon.attributedRevenuePaise)} delivered revenue` : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => toggle(coupon)} className="btn btn-outline btn-sm">
                {coupon.isActive ? "Pause" : "Resume"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-muted">
        Outlet offers are merchant-funded: the discount is deducted from your next payout, while platform-funded
        coupons stay on BiteBox. Use them as acquisition campaigns and watch the redeemed count.
      </p>
    </div>
  );
}

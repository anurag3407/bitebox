"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Download, Link2, MessageCircle, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { useApi, errorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/misc";

function inr(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  MARKETPLACE: "Marketplace",
  MERCHANT_DIRECT_SESSION: "Direct · 24h session",
  MERCHANT_FIRST_ORIGIN: "Direct · first origin",
  MEAL_PASS: "Meal pass",
  CORPORATE_CLUB: "Corporate club",
  SURPLUS_BAG: "Surplus bag",
};

function Metric({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-success" : tone === "warn" ? "text-amber-700" : "text-text-primary";
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-text-secondary mt-1">{sub}</p>}
    </div>
  );
}

export function MerchantGrowthPanel({ restaurantId }: { restaurantId: string }) {
  const api = useApi();
  const toast = useToast();
  const analytics = useQuery({
    queryKey: ["merchant-analytics", restaurantId],
    queryFn: () => api.getMerchantAnalytics(restaurantId),
  });
  const link = useQuery({
    queryKey: ["merchant-attribution-link", restaurantId],
    queryFn: () => api.getMerchantAttributionLink(restaurantId),
  });
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!link.data?.url) return;
    let cancelled = false;
    QRCode.toDataURL(link.data.url, { width: 240, margin: 1, color: { dark: "#111827", light: "#FFFFFF" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link.data?.url]);

  if (analytics.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-secondary">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }
  if (analytics.isError || !analytics.data) {
    return <p className="text-sm text-red-700 py-8">{errorMessage(analytics.error, "Could not load growth analytics.")}</p>;
  }

  const report = analytics.data;
  const saved = report.netRupeesSavedPaise;

  const copy = async () => {
    if (!link.data?.url) return;
    try {
      await navigator.clipboard.writeText(link.data.url);
      toast("Direct-order link copied", "success");
    } catch {
      toast("Could not copy the link", "error");
    }
  };

  const share = () => {
    if (!link.data?.url) return;
    const text = `Order directly from us — 0% restaurant commission: ${link.data.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-text-primary">Growth & savings</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Last 30 days. Savings compare your actual platform fees with a 30% incumbent benchmark.
          </p>
        </div>
        <button
          onClick={() => analytics.refetch()}
          className="inline-flex items-center gap-1.5 text-xs font-bold border border-border rounded-xl px-3 py-2 hover:bg-surface-muted"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${analytics.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric
          label="Saved vs 30%"
          value={inr(saved)}
          sub={saved >= 0 ? "vs incumbent take rate" : "fees above benchmark"}
          tone={saved >= 0 ? "good" : "warn"}
        />
        <Metric label="Effective take rate" value={`${report.effectiveTakeRatePercent}%`} sub={`${inr(report.totalPlatformFeesPaise)} paid`} />
        <Metric label="GMV" value={inr(report.totalGmvPaise)} sub={`${report.totalOrders} orders`} />
        <Metric
          label="Reliability rebate"
          value={report.reliabilityRebateEligible ? inr(report.reliabilityRebatePaise) : "Locked"}
          sub={report.reliabilityRebateEligible ? `${report.reliabilityRebateBp / 100}% rebate earned` : "<1% defects · >96% on-time"}
          tone={report.reliabilityRebateEligible ? "good" : "default"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="On-time handover" value={`${report.onTimeHandoverRatePercent}%`} sub="ready within prep + 8 min" tone={report.onTimeHandoverRatePercent > 96 ? "good" : "default"} />
        <Metric label="Defect refunds" value={`${report.defectRefundRatePercent}%`} sub="merchant-quality/delay" tone={report.defectRefundRatePercent < 1 ? "good" : "warn"} />
      </div>

      <section className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-black text-text-primary">Order source mix</h3>
          <span className="text-[10px] font-bold text-text-secondary">COMMISSION SNAPSHOTTED AT CHECKOUT</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted text-text-secondary">
              <tr>
                <th className="px-4 py-2 font-black">Channel</th>
                <th className="px-4 py-2 font-black text-right">Orders</th>
                <th className="px-4 py-2 font-black text-right">GMV</th>
                <th className="px-4 py-2 font-black text-right">Platform fees</th>
                <th className="px-4 py-2 font-black text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.channels.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                    No paid orders in this period yet.
                  </td>
                </tr>
              )}
              {report.channels.map((channel) => (
                <tr key={channel.channel}>
                  <td className="px-4 py-2.5 font-bold text-text-primary">{CHANNEL_LABELS[channel.channel] ?? channel.channel}</td>
                  <td className="px-4 py-2.5 text-right">{channel.orders}</td>
                  <td className="px-4 py-2.5 text-right">{inr(channel.gmvPaise)}</td>
                  <td className="px-4 py-2.5 text-right">{inr(channel.platformFeesPaise)}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{channel.gmvSharePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-black text-text-primary">Your direct-order storefront</h3>
        </div>
        <p className="text-xs text-text-secondary mt-1">
          Table QR and WhatsApp link attribute orders to this outlet for 24 hours. The customer keeps the menu price; commission is zero.
        </p>

        {link.isLoading && <p className="text-xs text-text-secondary mt-4">Generating link…</p>}
        {link.isError && <p className="text-xs text-red-700 mt-4">{errorMessage(link.error, "Could not generate the link.")}</p>}
        {link.data && (
          <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-4 items-start">
            <div className="space-y-3 min-w-0">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2">
                <Link2 className="w-4 h-4 text-text-secondary shrink-0" />
                <input readOnly value={link.data.url} className="bg-transparent text-xs flex-1 min-w-0 outline-none" aria-label="Direct order link" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-bold border border-border rounded-xl px-3 py-2 hover:bg-surface-muted">
                  <Link2 className="w-3.5 h-3.5" /> Copy link
                </button>
                <button onClick={share} className="inline-flex items-center gap-1.5 text-xs font-bold border border-border rounded-xl px-3 py-2 hover:bg-surface-muted">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </button>
                <a
                  href={qr ?? "#"}
                  download={`${link.data.slug}-direct-qr.png`}
                  className={`inline-flex items-center gap-1.5 text-xs font-bold border border-border rounded-xl px-3 py-2 hover:bg-surface-muted ${qr ? "" : "pointer-events-none opacity-50"}`}
                >
                  <Download className="w-3.5 h-3.5" /> Download QR
                </a>
              </div>
              <p className="text-[10px] text-text-secondary flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Signed link · expires {new Date(link.data.expiresAt).toLocaleDateString("en-IN")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-2 self-start">
              {qr ? (
                <img src={qr} alt={`QR code for ${link.data.slug}`} className="w-40 h-40" />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center text-text-secondary">
                  <Spinner />
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

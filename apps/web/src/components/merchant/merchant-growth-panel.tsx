"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, Download, MessageCircle, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { useApi, errorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { PageSpinner, SafeImage, Stat } from "@/components/ui/misc";

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
  return <Stat label={label} value={value} sub={sub} tone={tone === "good" ? "good" : tone === "warn" ? "bad" : undefined} />;
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
  const sponsorship = useQuery({ queryKey: ["merchant-sponsorship", restaurantId], queryFn: () => api.getSponsorship(restaurantId) });
  const adAnalytics = useQuery({ queryKey: ["merchant-ad-analytics", restaurantId], queryFn: () => api.getSponsorshipAnalytics(restaurantId) });
  const [buyingDays, setBuyingDays] = useState<number | null>(null);
  const [dailyBudget, setDailyBudget] = useState<number>(99);
  const [bidCpc, setBidCpc] = useState<number>(5);
  const [savingCampaign, setSavingCampaign] = useState(false);

  useEffect(() => {
    if (sponsorship.data) {
      if (sponsorship.data.maxDailyBudgetPaise) setDailyBudget(Math.round(sponsorship.data.maxDailyBudgetPaise / 100));
      if (sponsorship.data.bidPerClickPaise) setBidCpc(Math.round(sponsorship.data.bidPerClickPaise / 100));
    }
  }, [sponsorship.data]);

  const saveCampaignSettings = async () => {
    setSavingCampaign(true);
    try {
      await api.updateSponsorshipCampaign(restaurantId, {
        maxDailyBudgetPaise: dailyBudget * 100,
        bidPerClickPaise: bidCpc * 100,
      });
      await sponsorship.refetch();
      await adAnalytics.refetch();
      toast("Ad campaign settings updated", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingCampaign(false);
    }
  };

  const buyBoost = async (days: 3 | 7 | 14) => {
    setBuyingDays(days);
    try {
      await api.purchaseSponsorship(restaurantId, days);
      await sponsorship.refetch();
      toast("Sponsored placement activated", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBuyingDays(null);
    }
  };

  useEffect(() => {
    if (!link.data?.url) return;
    let cancelled = false;
    QRCode.toDataURL(link.data.url, { width: 240, margin: 1, color: { dark: "#111111", light: "#FFFFFF" } })
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

  if (analytics.isLoading) return <PageSpinner />;
  if (analytics.isError || !analytics.data) {
    return <p className="notice notice-danger">{errorMessage(analytics.error, "Could not load growth analytics.")}</p>;
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
    <div className="space-y-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="h-section">Growth & savings</h2>
          <p className="mt-1.5 max-w-xl text-sm text-ink-muted">Last 30 days. Savings compare your actual platform fees with a 30% incumbent benchmark.</p>
        </div>
        <button onClick={() => analytics.refetch()} className="btn btn-outline btn-sm">
          <RefreshCw className={`h-3.5 w-3.5 ${analytics.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <section className="rounded-3xl border border-line bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <TrendingUp className="h-4 w-4" /> Sponsored placement
            </h3>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Appear above organic listings with a “Sponsored” label. Paid from your BiteBox Credits at {inr(sponsorship.data?.dailyRatePaise ?? 9900)}/day.
            </p>
          </div>
          {sponsorship.data?.active && (
            <span className="badge badge-success">
              Active · {sponsorship.data.daysRemaining} days left
            </span>
          )}
        </div>
        {!sponsorship.data?.active && (
          <div className="mt-4 flex flex-wrap gap-2">
            {([3, 7, 14] as const).map((days) => (
              <button
                key={days}
                className="btn btn-secondary"
                disabled={buyingDays !== null}
                onClick={() => buyBoost(days)}
              >
                {buyingDays === days ? "Buying…" : `${days} days · ${inr(days * (sponsorship.data?.dailyRatePaise ?? 9900))}`}
              </button>
            ))}
          </div>
        )}

        {/* Ad Performance Analytics & Campaign Budget */}
        {adAnalytics.data && (
          <div className="mt-6 border-t border-line pt-6 space-y-5">
            <h4 className="text-sm font-semibold text-ink">Ad performance & campaign stats (Last 30 days)</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface-subtle p-3">
                <span className="text-xs text-ink-muted">Impressions</span>
                <p className="mt-1 text-lg font-bold text-ink">{adAnalytics.data.totalImpressions.toLocaleString("en-IN")}</p>
                <span className="text-[11px] text-ink-muted">Discovery views</span>
              </div>
              <div className="rounded-xl border border-line bg-surface-subtle p-3">
                <span className="text-xs text-ink-muted">Clicks</span>
                <p className="mt-1 text-lg font-bold text-ink">{adAnalytics.data.totalClicks.toLocaleString("en-IN")}</p>
                <span className="text-[11px] text-ink-muted">{adAnalytics.data.ctrPercent}% CTR</span>
              </div>
              <div className="rounded-xl border border-line bg-surface-subtle p-3">
                <span className="text-xs text-ink-muted">Ad Orders</span>
                <p className="mt-1 text-lg font-bold text-ink">{adAnalytics.data.conversions}</p>
                <span className="text-[11px] text-ink-muted">{adAnalytics.data.conversionRatePercent}% CVR</span>
              </div>
              <div className="rounded-xl border border-line bg-surface-subtle p-3">
                <span className="text-xs text-ink-muted">ROAS</span>
                <p className="mt-1 text-lg font-bold text-emerald-600">{adAnalytics.data.roas > 0 ? `${adAnalytics.data.roas}x` : "—"}</p>
                <span className="text-[11px] text-ink-muted">{inr(adAnalytics.data.totalSalesPaise)} ad sales</span>
              </div>
            </div>

            {sponsorship.data?.active && (
              <div className="rounded-2xl border border-line/80 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Campaign Bidding & Budget</h5>
                    <p className="text-xs text-ink-soft">Control daily expenditure caps and maximum CPC click bids.</p>
                  </div>
                  <button
                    onClick={saveCampaignSettings}
                    disabled={savingCampaign}
                    className="btn btn-outline btn-xs"
                  >
                    {savingCampaign ? "Saving…" : "Save settings"}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-ink-muted">Daily budget cap (₹)</label>
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={dailyBudget}
                      onChange={(e) => setDailyBudget(Number(e.target.value))}
                      className="input input-sm mt-1 w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-muted">Max bid per click (₹ CPC)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={bidCpc}
                      onChange={(e) => setBidCpc(Number(e.target.value))}
                      className="input input-sm mt-1 w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Saved vs 30%" value={inr(saved)} sub={saved >= 0 ? "vs incumbent take rate" : "fees above benchmark"} tone={saved >= 0 ? "good" : "warn"} />
        <Metric label="Effective take rate" value={`${report.effectiveTakeRatePercent}%`} sub={`${inr(report.totalPlatformFeesPaise)} paid`} />
        <Metric label="GMV" value={inr(report.totalGmvPaise)} sub={`${report.totalOrders} orders`} />
        <Metric
          label="Reliability rebate"
          value={report.reliabilityRebateEligible ? inr(report.reliabilityRebatePaise) : "Locked"}
          sub={report.reliabilityRebateEligible ? `${report.reliabilityRebateBp / 100}% rebate earned` : "Needs <1% defects and >96% on time"}
          tone={report.reliabilityRebateEligible ? "good" : "default"}
        />
        <Metric label="On-time handover" value={`${report.onTimeHandoverRatePercent}%`} sub="Ready within prep + 8 min" tone={report.onTimeHandoverRatePercent > 96 ? "good" : "default"} />
        <Metric label="Defect refunds" value={`${report.defectRefundRatePercent}%`} sub="Quality or delay refunds" tone={report.defectRefundRatePercent < 1 ? "good" : "warn"} />
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-base font-semibold text-ink">Where orders come from</h3>
          <span className="text-xs text-ink-muted">Commission fixed at checkout</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm tabular">
            <thead className="text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th className="py-3 pr-4 font-medium">Channel</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">GMV</th>
                <th className="px-4 py-3 text-right font-medium">Platform fees</th>
                <th className="py-3 pl-4 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.channels.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-ink-muted">
                    No paid orders in this period yet.
                  </td>
                </tr>
              )}
              {report.channels.map((channel) => (
                <tr key={channel.channel}>
                  <td className="py-3.5 pr-4 font-medium text-ink">{CHANNEL_LABELS[channel.channel] ?? channel.channel}</td>
                  <td className="px-4 py-3.5 text-right text-ink-soft">{channel.orders}</td>
                  <td className="px-4 py-3.5 text-right text-ink-soft">{inr(channel.gmvPaise)}</td>
                  <td className="px-4 py-3.5 text-right text-ink-soft">{inr(channel.platformFeesPaise)}</td>
                  <td className="py-3.5 pl-4 text-right font-medium text-ink">{channel.gmvSharePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <h3 className="text-base font-semibold text-ink">Your direct-order link</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-muted">
          Put the QR on tables or share the link on WhatsApp. Orders through it are attributed to you for 24 hours, the customer pays menu price, and commission is zero.
        </p>

        {link.isLoading && <p className="mt-6 text-sm text-ink-muted">Generating link…</p>}
        {link.isError && <p className="notice notice-danger mt-6">{errorMessage(link.error, "Could not generate the link.")}</p>}
        {link.data && (
          <div className="mt-8 grid items-start gap-8 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-4">
              <input readOnly value={link.data.url} onFocus={(e) => e.target.select()} className="input bg-white text-sm" aria-label="Direct order link" />
              <div className="flex flex-wrap gap-2">
                <button onClick={copy} className="btn btn-primary btn-sm">
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </button>
                <button onClick={share} className="btn btn-outline btn-sm bg-white">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </button>
                <a
                  href={qr ?? "#"}
                  download={`${link.data.slug}-direct-qr.png`}
                  aria-disabled={!qr}
                  className={`btn btn-outline btn-sm bg-white ${qr ? "" : "pointer-events-none opacity-40"}`}
                >
                  <Download className="h-3.5 w-3.5" /> Download QR
                </a>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> Signed link · expires {new Date(link.data.expiresAt).toLocaleDateString("en-IN")}
              </p>
            </div>
            <SafeImage src={qr} alt={`QR code for ${link.data.slug}`} className="h-40 w-40 rounded-2xl bg-white p-2" />
          </div>
        )}
      </section>
    </div>
  );
}

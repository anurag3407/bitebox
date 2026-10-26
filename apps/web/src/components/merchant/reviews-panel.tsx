"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Star } from "lucide-react";
import { useApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";

export function MerchantReviewsPanel({ restaurantId }: { restaurantId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const reviews = useQuery({ queryKey: ["merchant-reviews", restaurantId], queryFn: () => api.getMerchantReviews(restaurantId) });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reply = async (ratingId: string) => {
    const text = (drafts[ratingId] ?? "").trim();
    if (text.length < 3) return;
    setBusy(ratingId);
    try {
      await api.replyToReview(restaurantId, ratingId, text);
      await queryClient.invalidateQueries({ queryKey: ["merchant-reviews", restaurantId] });
      setDrafts((d) => ({ ...d, [ratingId]: "" }));
      toast("Reply published", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  if (reviews.isPending) return <div className="skeleton h-48" />;
  const list = reviews.data ?? [];
  if (list.length === 0) {
    return <EmptyState icon={<MessageSquare />} title="No reviews yet" body="Customer ratings and photos appear here as orders are delivered." />;
  }
  const average = list.reduce((sum, r) => sum + r.foodRating, 0) / list.length;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-6 rounded-3xl bg-subtle px-6 py-5">
        <div>
          <p className="text-xs text-ink-muted">Average food rating</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-semibold text-ink tabular">
            {average.toFixed(1)} <Star className="h-5 w-5 fill-ink" />
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Reviews</p>
          <p className="mt-1 text-3xl font-semibold text-ink tabular">{list.length}</p>
        </div>
        <p className="ml-auto max-w-xs text-xs leading-relaxed text-ink-muted">
          Reply publicly to build trust. Keep it short, specific and courteous.
        </p>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {list.map((r) => (
          <li key={r.id} className="py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-ink">
                  {r.customerName.slice(0, 1)}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{r.customerName}</p>
                  <p className="text-xs text-ink-muted">{timeAgo(r.createdAt)}</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-ink tabular">
                {r.foodRating} <Star className="h-3.5 w-3.5 fill-ink" />
              </span>
            </div>
            {r.comment && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{r.comment}</p>}
            {r.photos.length > 0 && (
              <div className="mt-3 flex gap-2">
                {r.photos.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Review photo ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
                  </a>
                ))}
              </div>
            )}
            {r.dishRatings.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.dishRatings.map((d) => (
                  <span key={d.menuItemId} className="badge badge-neutral">
                    {d.name} · {d.rating}/5
                  </span>
                ))}
              </div>
            )}
            {r.restaurantReply ? (
              <div className="mt-4 rounded-2xl bg-subtle px-4 py-3 text-sm">
                <p className="text-xs font-medium text-ink">Your reply</p>
                <p className="mt-1 text-ink-soft">{r.restaurantReply}</p>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <input
                  value={drafts[r.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  maxLength={500}
                  placeholder="Thank the guest or explain what happened…"
                  aria-label={`Reply to ${r.customerName}`}
                  className="input h-11 min-w-0 flex-1"
                />
                <button
                  disabled={busy === r.id || (drafts[r.id] ?? "").trim().length < 3}
                  onClick={() => reply(r.id)}
                  className="btn btn-primary btn-sm h-11"
                >
                  {busy === r.id ? <Spinner /> : "Reply"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

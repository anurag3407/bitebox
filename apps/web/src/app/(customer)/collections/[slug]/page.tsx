"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers } from "lucide-react";
import { RestaurantCard } from "@/components/discovery/RestaurantCard";
import { EmptyState, PageSpinner, SafeImage } from "@/components/ui/misc";
import { useApi } from "@/lib/api";

export default function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const api = useApi();
  const collection = useQuery({ queryKey: ["collection", slug], queryFn: () => api.getCollection(slug) });

  if (collection.isLoading) return <PageSpinner />;
  if (collection.isError || !collection.data) {
    return (
      <div className="page py-16">
        <EmptyState
          icon={<Layers />}
          title="This collection isn't available"
          body="It may have been retired. Browse the other lists our reviewers are eating through."
          action={<Link href="/collections" className="btn btn-primary">All collections</Link>}
        />
      </div>
    );
  }

  const data = collection.data;
  return (
    <div className="page pb-20 pt-6">
      <Link href="/collections" className="btn btn-ghost btn-sm -ml-4 gap-1.5">
        <ArrowLeft className="h-4 w-4" /> All collections
      </Link>

      <div className="relative mt-5 overflow-hidden rounded-[32px] bg-ink">
        <SafeImage src={data.imageUrl} alt={data.title} className="h-64 w-full object-cover opacity-55 sm:h-80" />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/85 via-ink/25 to-transparent p-6 sm:p-10">
          <p className="eyebrow text-white/60">Curated collection</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{data.title}</h1>
          {data.subtitle && <p className="mt-2 text-sm text-white/75 sm:text-base">{data.subtitle}</p>}
          <p className="mt-3 text-xs text-white/55">
            {data.restaurantCount} {data.restaurantCount === 1 ? "restaurant" : "restaurants"} · hand-picked by the BiteBox team
          </p>
        </div>
      </div>

      {data.description && (
        <p className="mt-7 max-w-3xl text-[15px] leading-relaxed text-ink-soft">{data.description}</p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">In this collection</h2>
        <span className="badge badge-neutral">{data.restaurants.length}</span>
      </div>

      {data.restaurants.length === 0 ? (
        <EmptyState icon={<Layers />} title="No restaurants in this list yet" />
      ) : (
        <ul className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {data.restaurants.map((restaurant) => (
            <li key={restaurant.id}>
              <RestaurantCard restaurant={restaurant} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

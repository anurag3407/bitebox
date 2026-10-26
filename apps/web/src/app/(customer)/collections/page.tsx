"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Layers, Sparkles } from "lucide-react";
import { EmptyState, PageSpinner, SafeImage } from "@/components/ui/misc";
import { useApi } from "@/lib/api";

export default function CollectionsPage() {
  const api = useApi();
  const collections = useQuery({ queryKey: ["collections"], queryFn: () => api.getCollections() });

  return (
    <div className="page pb-20 pt-8">
      <div className="max-w-2xl">
        <p className="eyebrow flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Curated by BiteBox
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Collections worth eating through.</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
          Short, opinionated lists from our reviewers — a biryani route, the kitchens that stay open late, and the classics
          that made a neighbourhood.
        </p>
      </div>

      {collections.isLoading ? (
        <PageSpinner />
      ) : collections.isError ? (
        <EmptyState
          icon={<Layers />}
          title="Couldn't load collections"
          body="Check your connection and try again."
          action={<button onClick={() => collections.refetch()} className="btn btn-primary">Try again</button>}
        />
      ) : collections.data?.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="Collections are being plated"
          body="Our reviewers are out eating. New lists land every week."
          action={<Link href="/" className="btn btn-primary">Browse restaurants</Link>}
        />
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {collections.data!.map((collection) => (
            <li key={collection.id}>
              <Link
                href={`/collections/${collection.slug}`}
                className="group block overflow-hidden rounded-3xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <SafeImage
                    src={collection.imageUrl}
                    alt={collection.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                  <span className="absolute bottom-4 left-4 badge bg-white/95 text-ink">
                    {collection.restaurantCount} {collection.restaurantCount === 1 ? "place" : "places"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <h2 className="text-base font-semibold text-ink">{collection.title}</h2>
                    {collection.subtitle && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{collection.subtitle}</p>}
                  </div>
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted transition group-hover:text-ink" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

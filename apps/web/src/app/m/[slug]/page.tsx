import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyAttributionToken } from "@startup/core";
import { AttributionRepository, RestaurantRepository } from "@startup/database";
import { StorefrontClient } from "@/components/storefront/storefront-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await RestaurantRepository.findBySlug(slug);
  return {
    title: restaurant ? `${restaurant.name} — order direct` : "Storefront",
    description: restaurant ? `${restaurant.cuisines.join(", ")} — order direct with 0% restaurant commission.` : "Order directly from the restaurant.",
  };
}

export default async function MerchantStorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;
  const restaurant = await RestaurantRepository.findBySlug(slug);
  if (!restaurant) notFound();

  let verifiedToken: string | undefined;
  if (token) {
    const link = await AttributionRepository.findLinkBySlug(slug);
    if (link) {
      const payload = verifyAttributionToken(token, link.hmacSecret);
      if (payload?.restaurantId === restaurant.id && payload.slug === slug) verifiedToken = token;
    }
  }

  return <StorefrontClient restaurant={restaurant} token={verifiedToken} />;
}

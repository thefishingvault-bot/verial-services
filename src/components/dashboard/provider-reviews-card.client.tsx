"use client";

import dynamic from "next/dynamic";

const ProviderReviewsCardInner = dynamic(
  () => import("./provider-reviews-card").then((m) => m.ProviderReviewsCard),
  {
    ssr: false,
    loading: () => null,
  },
);

export function ProviderReviewsCardClient() {
  return <ProviderReviewsCardInner />;
}

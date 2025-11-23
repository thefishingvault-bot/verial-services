"use client";

import dynamic from "next/dynamic";

const ProviderAnalyticsCardInner = dynamic(
  () => import("./provider-analytics-card").then((m) => m.ProviderAnalyticsCard),
  {
    ssr: false,
    loading: () => null,
  },
);

export function ProviderAnalyticsCardClient() {
  return <ProviderAnalyticsCardInner />;
}

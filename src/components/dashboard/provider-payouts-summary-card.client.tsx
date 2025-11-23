"use client";

import dynamic from "next/dynamic";

const ProviderPayoutsSummaryCardInner = dynamic(
  () => import("./provider-payouts-summary-card").then((m) => m.ProviderPayoutsSummaryCard),
  {
    ssr: false,
    loading: () => null,
  },
);

export function ProviderPayoutsSummaryCardClient() {
  return <ProviderPayoutsSummaryCardInner />;
}

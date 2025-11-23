"use client";

import dynamic from "next/dynamic";

const ProviderServicePerformanceCardInner = dynamic(
  () => import("./provider-service-performance-card").then((m) => m.ProviderServicePerformanceCard),
  {
    ssr: false,
    loading: () => null,
  },
);

export function ProviderServicePerformanceCardClient() {
  return <ProviderServicePerformanceCardInner />;
}

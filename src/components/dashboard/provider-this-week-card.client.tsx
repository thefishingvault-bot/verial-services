"use client";

import dynamic from "next/dynamic";

const ProviderThisWeekCardInner = dynamic(
  () => import("./provider-this-week-card").then((m) => m.ProviderThisWeekCard),
  {
    ssr: false,
    loading: () => null,
  },
);

export function ProviderThisWeekCardClient() {
  return <ProviderThisWeekCardInner />;
}

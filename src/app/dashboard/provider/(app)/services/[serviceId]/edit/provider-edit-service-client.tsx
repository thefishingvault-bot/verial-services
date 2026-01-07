 'use client';

import { ProviderServiceForm } from '@/components/forms/provider-service-form';

type ProviderEditServiceClientProps = {
  providerStatus: 'pending' | 'approved' | 'rejected';
  providerBaseRegion: string | null;
  providerBaseSuburb: string | null;
  providerServiceRadiusKm: number;
  providerChargesGst: boolean;
  blockedReason?: string;
};

export function ProviderEditServiceClient({
  providerStatus,
  providerBaseRegion,
  providerBaseSuburb,
  providerServiceRadiusKm,
  providerChargesGst,
  blockedReason,
}: ProviderEditServiceClientProps) {
  return (
    <ProviderServiceForm
      mode="edit"
      providerStatus={providerStatus}
      providerBaseRegion={providerBaseRegion}
      providerBaseSuburb={providerBaseSuburb}
      providerServiceRadiusKm={providerServiceRadiusKm}
      providerChargesGst={providerChargesGst}
      blockedReason={blockedReason}
    />
  );
}

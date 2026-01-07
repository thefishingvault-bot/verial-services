
 'use client';

import { ProviderServiceForm } from '@/components/forms/provider-service-form';

type ProviderServiceNewClientProps = {
  providerStatus: 'pending' | 'approved' | 'rejected';
  providerBaseRegion: string | null;
  providerBaseSuburb: string | null;
  providerServiceRadiusKm: number;
  providerChargesGst: boolean;
  blockedReason?: string;
};

export function ProviderServiceNewClient({
  providerStatus,
  providerBaseRegion,
  providerBaseSuburb,
  providerServiceRadiusKm,
  providerChargesGst,
  blockedReason,
}: ProviderServiceNewClientProps) {
  return (
    <ProviderServiceForm
      mode="create"
      providerStatus={providerStatus}
      providerBaseRegion={providerBaseRegion}
      providerBaseSuburb={providerBaseSuburb}
      providerServiceRadiusKm={providerServiceRadiusKm}
      providerChargesGst={providerChargesGst}
      blockedReason={blockedReason}
    />
  );
}

import { Metadata } from 'next';
import ProviderCommunicationTools from '@/components/ProviderCommunicationTools';
import { requireAdmin } from '@/lib/admin-auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Provider Communication Tools | Verial Services',
  description: 'Send bulk messages and manage provider communications',
};

export const dynamic = 'force-dynamic';

export default async function ProviderCommunicationPage() {
  const admin = await requireAdmin();
  if (!admin.isAdmin) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <ProviderCommunicationTools />
    </div>
  );
}
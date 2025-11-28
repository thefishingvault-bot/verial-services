import { Metadata } from 'next';
import ProviderCommunicationTools from '@/components/ProviderCommunicationTools';

export const metadata: Metadata = {
  title: 'Provider Communication Tools | Verial Services',
  description: 'Send bulk messages and manage provider communications',
};

export default function ProviderCommunicationPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <ProviderCommunicationTools />
    </div>
  );
}

'use client';

import { useState } from 'react';

import { useAuth } from '@clerk/nextjs';
import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface ContactButtonProps {
  providerId: string;
  serviceId?: string;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  label?: string;
}

export function ContactButton({
  providerId,
  serviceId,
  className,
  variant = 'outline',
  label = 'Message Provider',
}: ContactButtonProps) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleContact = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (!isSignedIn) {
      const redirectUrl = encodeURIComponent(window.location.href);
      router.push(`/sign-in?redirect_url=${redirectUrl}`);
      return;
    }

    if (isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch('/api/messages/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, serviceId }),
      });

      if (res.status === 401) {
        const redirectUrl = encodeURIComponent(window.location.href);
        router.push(`/sign-in?redirect_url=${redirectUrl}`);
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        const message = text || 'Unable to start conversation.';

        if (
          res.status === 403 &&
          (message.toLowerCase().includes('no booking') || message.toLowerCase().includes('booking'))
        ) {
          toast.info('Book to message', {
            description: 'You can message a provider once you have an active booking with them.',
          });
          return;
        }

        toast.error('Unable to start conversation', { description: message });
        return;
      }

      const json = (await res.json()) as { conversationId?: string; bookingId?: string };
      const conversationId = json.conversationId ?? json.bookingId;
      if (!conversationId) {
        toast.error('Unable to start conversation');
        return;
      }

      router.push(`/dashboard/messages/${conversationId}`);
    } catch {
      toast.error('Unable to start conversation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleContact}
      disabled={isLoading}
      aria-busy={isLoading}
    >
      <MessageSquare className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

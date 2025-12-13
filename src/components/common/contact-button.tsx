
'use client';

import { useState } from 'react';

import { useAuth } from '@clerk/nextjs';
import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface ContactButtonProps {
  providerId: string;
  serviceId?: string;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  label?: string;
  iconOnly?: boolean;
  ariaLabel?: string;
}

export function ContactButton({
  providerId,
  serviceId,
  className,
  variant = 'outline',
  label = 'Message Provider',
  iconOnly = false,
  ariaLabel,
}: ContactButtonProps) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
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
          toast({
            title: 'Book to message',
            description: 'You can message a provider once you have an active booking with them.',
          });
          return;
        }

        toast({
          title: 'Unable to start conversation',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      const json = (await res.json()) as { conversationId?: string; bookingId?: string };
      const conversationId = json.conversationId ?? json.bookingId;
      if (!conversationId) {
        toast({ title: 'Unable to start conversation', variant: 'destructive' });
        return;
      }

      router.push(`/dashboard/messages/${conversationId}`);
    } catch {
      toast({ title: 'Unable to start conversation', variant: 'destructive' });
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
      aria-label={ariaLabel ?? label}
    >
      <MessageSquare className={iconOnly ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
      {iconOnly ? null : label}
    </Button>
  );
}

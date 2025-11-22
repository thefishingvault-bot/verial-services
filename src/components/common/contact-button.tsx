'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';

interface ContactButtonProps {
  providerUserId: string;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  label?: string;
}

export function ContactButton({
  providerUserId,
  className,
  variant = 'outline',
  label = 'Message Provider',
}: ContactButtonProps) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleContact = async () => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${window.location.href}`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/chat/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: providerUserId }),
      });

      if (!res.ok) throw new Error('Failed to start conversation');

      const { conversationId } = await res.json();
      router.push(`/dashboard/messages/${conversationId}`);
    } catch {
      toast.error('Error', {
        description: 'Could not start chat. Please try again.',
      });
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleContact}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <MessageSquare className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}

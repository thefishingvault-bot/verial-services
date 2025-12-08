'use client';

import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
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

  const handleContact = async () => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${window.location.href}`);
      return;
    }

    toast.info('Book to message', {
      description: 'You can message a provider once you have an active booking with them.',
    });
  };

  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleContact}
    >
      <MessageSquare className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

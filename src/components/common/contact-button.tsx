'use client';

import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

interface ContactButtonProps {
  email: string;
  subject: string;
  label?: string;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export function ContactButton({
  email,
  subject,
  label = 'Contact Provider',
  className,
  variant = 'outline',
}: ContactButtonProps) {
  return (
    <Button
      variant={variant}
      className={className}
      onClick={() =>
        (window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`)
      }
    >
      <Mail className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

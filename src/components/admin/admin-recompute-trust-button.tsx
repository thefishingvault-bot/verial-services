"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface AdminRecomputeTrustButtonProps {
  providerId: string;
}

export function AdminRecomputeTrustButton({ providerId }: AdminRecomputeTrustButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const res = await fetch('/api/admin/recompute-trust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Failed to recompute trust', text);
        setError('Could not recompute trust. Please try again or check logs.');
        return;
      }

      setSuccess('Trust recomputed successfully.');
      router.refresh();
    } catch (err) {
      console.error('Error recomputing trust', err);
      setError('Could not recompute trust. Please try again or check logs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button size="sm" onClick={handleClick} disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
        Recompute trust
      </Button>
      {success && <p className="text-[11px] text-emerald-600">{success}</p>}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

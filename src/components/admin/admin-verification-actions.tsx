"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AdminVerificationActionsProps {
  providerId: string;
  status: 'pending' | 'approved' | 'rejected';
}

export function AdminVerificationActions({ providerId, status }: AdminVerificationActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const updateStatus = async (newStatus: 'approved' | 'rejected') => {
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/admin/verify-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, newStatus }),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('Failed to update provider status', await res.text());
      }
      router.refresh();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating provider status', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status !== 'pending') {
    return null;
  }

  return (
    <div className="flex justify-end gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Approve
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this provider?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the provider as approved and verified. They will be able to appear in search
              and accept bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => updateStatus('approved')}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Reject
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this provider?</AlertDialogTitle>
            <AlertDialogDescription>
              The provider will be marked as rejected and will no longer appear in the pending queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={() => updateStatus('rejected')}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

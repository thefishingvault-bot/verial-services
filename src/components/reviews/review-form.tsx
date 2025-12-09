'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { StarRating } from '@/components/forms/star-rating';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface ReviewFormProps {
  bookingId: string;
  serviceTitle: string;
  providerId: string;
  onReviewSubmit: () => void;
}

const formSchema = z.object({
  rating: z.number().min(1, 'Rating is required').max(5),
  comment: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function ReviewForm({ bookingId, serviceTitle, providerId, onReviewSubmit }: ReviewFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    // @ts-ignore Zod v4 resolver typing mismatch
    resolver: zodResolver(formSchema as any) as any,
    defaultValues: {
      rating: 0,
      comment: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/reviews/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          providerId, // Currently not required by the API but kept for future flexibility
          rating: values.rating,
          comment: values.comment,
        }),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to submit review');
      }

      toast({
        title: 'Review Submitted!',
        description: 'Thank you for your feedback.',
      });

      form.reset({ rating: 0, comment: '' });
      setIsOpen(false);
      onReviewSubmit(); // Refresh the bookings list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong while submitting your review.';
      toast({
        variant: 'destructive',
        title: 'Error submitting review',
        description: message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">Leave a Review</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave a Review for {serviceTitle}</DialogTitle>
          <DialogDescription>
            Your feedback helps our providers and the whole community.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rating</FormLabel>
                  <FormControl>
                    <StarRating value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comment (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Share your experience..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Submit Review'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


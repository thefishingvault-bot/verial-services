'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Define the form validation schema with Zod
const formSchema = z.object({
  businessName: z.string().min(3, {
    message: 'Business name must be at least 3 characters long.',
  }),
  handle: z.string()
    .min(3, { message: 'Handle must be at least 3 characters long.' })
    .regex(/^[a-z0-9-]+$/, {
      message: 'Handle must only contain lowercase letters, numbers, and hyphens.',
    }),
});

type FormValues = z.infer<typeof formSchema>;

type ProviderApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export default function RegisterProviderPage() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderApplicationStatus>('none');
  const [statusLoading, setStatusLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      businessName: '',
      handle: '',
    },
  });

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const res = await fetch('/api/provider/application', { method: 'GET' });
        if (!mounted) return;
        if (res.status === 404) {
          setStatus('none');
          return;
        }
        if (!res.ok) {
          // If status lookup fails, don't block registration; keep form visible.
          setStatus('none');
          return;
        }
        const data = (await res.json()) as { status?: ProviderApplicationStatus };
        if (data?.status === 'pending' || data?.status === 'approved' || data?.status === 'rejected') {
          setStatus(data.status);
        } else {
          setStatus('none');
        }
      } finally {
        if (mounted) setStatusLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, []);

  const isFormDisabled = useMemo(() => {
    return statusLoading || status === 'pending' || status === 'approved';
  }, [status, statusLoading]);

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/provider/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to register.');
      }

      // Registration successful; application is now awaiting admin approval.
      setStatus('pending');
      setIsLoading(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register.';
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-9rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Become a Provider</CardTitle>
          <CardDescription>
            Set up your provider profile to start listing services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!statusLoading && status === 'pending' && (
            <div className="mb-4 rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Your provider application has been submitted and is awaiting admin approval.
            </div>
          )}
          {!statusLoading && status === 'approved' && (
            <div className="mb-4 rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Your provider account is approved. You can access your provider dashboard.
              <div className="mt-2">
                <Button type="button" size="sm" onClick={() => router.push('/dashboard/provider')}>
                  Go to provider dashboard
                </Button>
              </div>
            </div>
          )}
          {!statusLoading && status === 'rejected' && (
            <div className="mb-4 rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Your provider application was rejected. You can update your details and reapply.
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Jane's Plumbing" {...field} disabled={isFormDisabled} />
                    </FormControl>
                    <FormDescription>
                      This is your public-facing business name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="handle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username (Handle)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., janes-plumbing"
                        {...field}
                        disabled={isFormDisabled}
                        onChange={(e) => {
                          // Auto-format to lowercase and valid chars
                          const formatted = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '');
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Your unique URL: {siteUrl.replace(/https?:\/\//, '')}/p/{field.value || '...'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <p className="text-sm font-medium text-destructive">{error}</p>
              )}

              <Button type="submit" disabled={isFormDisabled || isLoading} className="w-full">
                {statusLoading
                  ? 'Checking application...'
                  : status === 'pending'
                    ? 'Awaiting approval'
                    : isLoading
                      ? 'Registering...'
                      : 'Submit application'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}


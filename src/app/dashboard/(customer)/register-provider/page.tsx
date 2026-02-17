'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PROVIDER_CATEGORY_OPTIONS,
  getProviderCategoryLabel,
  providerCategorySelectionSchema,
  type ProviderCategory,
} from '@/lib/provider-categories';

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
  categories: providerCategorySelectionSchema.shape.categories,
  primaryCategory: providerCategorySelectionSchema.shape.primaryCategory,
  customCategory: z.string().trim().max(120).optional().nullable(),
}).superRefine((data, ctx) => {
  const deduped = Array.from(new Set(data.categories));
  if (deduped.length !== data.categories.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Duplicate categories are not allowed',
      path: ['categories'],
    });
  }

  if (!data.categories.includes(data.primaryCategory)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Primary category must be one of the selected categories',
      path: ['primaryCategory'],
    });
  }

  const hasOther = data.categories.includes('other');
  if (hasOther && (!data.customCategory || data.customCategory.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please specify your service',
      path: ['customCategory'],
    });
  }

  if (!hasOther && data.customCategory && data.customCategory.trim().length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Custom category is only allowed when 'Other' is selected",
      path: ['customCategory'],
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

type ProviderApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';
type ProviderKycStatus = 'not_started' | 'in_progress' | 'pending_review' | 'verified' | 'rejected';
type ProviderVerificationStatus = 'pending' | 'verified' | 'unavailable' | 'rejected';
type RegisterProviderState = 'loading' | 'verified' | 'pending' | 'unavailable' | 'error';

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default function RegisterProviderPage() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderApplicationStatus>('none');
  const [statusLoading, setStatusLoading] = useState(true);
  const [kycStatus, setKycStatus] = useState<ProviderKycStatus | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<ProviderVerificationStatus | null>(null);
  const [kycStatusLoading, setKycStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      businessName: '',
      handle: '',
      categories: [],
      primaryCategory: undefined,
      customCategory: null,
    },
  });

  const selectedCategories = form.watch('categories');
  const hasOtherCategory = selectedCategories.includes('other');

  const toggleCategory = (category: ProviderCategory, checked: boolean) => {
    const current = form.getValues('categories');
    if (checked) {
      if (current.includes(category)) return;
      if (current.length >= 3) {
        form.setError('categories', { message: 'Select up to 3 categories' });
        return;
      }

      const next = [...current, category];
      form.setValue('categories', next, { shouldValidate: true });
      if (!form.getValues('primaryCategory')) {
        form.setValue('primaryCategory', category, { shouldValidate: true });
      }
      return;
    }

    const next = current.filter((value) => value !== category);
    form.setValue('categories', next, { shouldValidate: true });

    const currentPrimary = form.getValues('primaryCategory');
    if (currentPrimary === category) {
      if (next.length > 0) {
        form.setValue('primaryCategory', next[0], { shouldValidate: true });
      }
    }

    if (category === 'other') {
      form.setValue('customCategory', null, { shouldValidate: true });
    }
  };

  const refreshOnboardingState = useCallback(async () => {
      setStatusLoading(true);
      setKycStatusLoading(true);
      setStatusError(null);
      setKycError(null);

      try {
        const res = await fetchWithTimeout('/api/provider/application', { method: 'GET' }, 9000);
        if (!res.ok) {
          setStatus('none');
          setStatusError('Application status check failed. You can still continue.');
        } else {
          const data = (await res.json()) as { exists?: boolean; status?: ProviderApplicationStatus };
          if (data?.status === 'pending' || data?.status === 'approved' || data?.status === 'rejected') {
            setStatus(data.status);
          } else {
            setStatus('none');
          }
        }
      } catch {
        setStatus('none');
        setStatusError('Application check timed out. You can still continue.');
      } finally {
        setStatusLoading(false);
      }

      try {
        const res = await fetchWithTimeout('/api/provider/kyc/status', { method: 'GET' }, 9000);
        if (!res.ok) {
          setKycStatus(null);
          setVerificationStatus(null);
          setKycError('Verification status check failed.');
        } else {
          const data = (await res.json()) as {
            exists?: boolean;
            kycStatus?: ProviderKycStatus | null;
            verificationStatus?: ProviderVerificationStatus | null;
          };
          setKycStatus(data?.exists ? (data.kycStatus ?? null) : null);
          setVerificationStatus(data?.exists ? (data.verificationStatus ?? null) : null);
        }
      } catch {
        setKycStatus(null);
        setVerificationStatus(null);
        setKycError('Verification status check timed out.');
      } finally {
        setKycStatusLoading(false);
      }
    }, []);

  useEffect(() => {
    void refreshOnboardingState();
  }, [refreshOnboardingState]);

  const onboardingState = useMemo<RegisterProviderState>(() => {
    if (statusLoading || kycStatusLoading) return 'loading';
    if (verificationStatus === 'unavailable') return 'unavailable';
    if (verificationStatus === 'verified') return 'verified';
    if (status === 'pending' || status === 'approved' || verificationStatus === 'pending') return 'pending';
    if (statusError || kycError) return 'error';
    return 'pending';
  }, [kycError, kycStatusLoading, status, statusError, statusLoading, verificationStatus]);

  const isFormDisabled = useMemo(() => {
    return status === 'pending' || status === 'approved';
  }, [status]);

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
        const alreadySubmitted = res.status === 400 && /already/i.test(errorText);
        const handleConflict = res.status === 409 || /handle/i.test(errorText);
        if (alreadySubmitted && !handleConflict) {
          router.push('/dashboard/provider/kyc');
          return;
        }
        throw new Error(errorText || 'Failed to register.');
      }

      // Registration successful; application is now awaiting admin approval.
      setStatus('pending');
      router.push('/dashboard/provider/kyc');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register.';
      setError(message);
    } finally {
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

              <FormField
                control={form.control}
                name="categories"
                render={() => (
                  <FormItem>
                    <FormLabel>What services do you offer?</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="w-full justify-between" disabled={isFormDisabled}>
                          <span className="truncate text-left">
                            {selectedCategories.length > 0
                              ? selectedCategories.map((category) => getProviderCategoryLabel(category)).join(', ')
                              : 'Select up to 3 categories'}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">{selectedCategories.length}/3</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-(--radix-popover-trigger-width) p-3" align="start">
                        <div className="space-y-2">
                          {PROVIDER_CATEGORY_OPTIONS.map((option) => {
                            const checked = selectedCategories.includes(option.value);
                            const disabled = !checked && selectedCategories.length >= 3;
                            return (
                              <label key={option.value} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => toggleCategory(option.value, Boolean(value))}
                                  disabled={isFormDisabled || disabled}
                                />
                                <span>{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormDescription>Select at least 1 category and up to 3.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="primaryCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Primary Service Category</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isFormDisabled || selectedCategories.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select primary category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {getProviderCategoryLabel(category)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {hasOtherCategory && (
                <FormField
                  control={form.control}
                  name="customCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Please specify your service</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Appliance repair"
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          disabled={isFormDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Identity verification</p>
                  <p className="text-sm text-muted-foreground">
                    You’ll complete verification in Sumsub. It usually takes a few minutes.
                  </p>
                  {verificationStatus !== 'verified' && (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Verification Required Before Payout
                    </p>
                  )}
                  {!kycStatusLoading && kycStatus && (
                    <p className="text-xs text-muted-foreground">
                      Status: <span className="font-medium text-foreground">{kycStatus.replace(/_/g, ' ')}</span>
                    </p>
                  )}
                  {!kycStatusLoading && verificationStatus && (
                    <p className="text-xs text-muted-foreground">
                      Verification: <span className="font-medium text-foreground">{verificationStatus}</span>
                    </p>
                  )}
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={statusLoading || status === 'none'}
                    onClick={() => router.push('/dashboard/provider/kyc')}
                  >
                    Verify identity with Sumsub
                  </Button>
                  {!statusLoading && status === 'none' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Submit your application first to start verification.
                    </p>
                  )}
                </div>
              </div>

              {onboardingState === 'unavailable' && (
                <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  <p>
                    Verification temporarily unavailable. You can continue setting up your profile. Verification will
                    be required before payouts.
                  </p>
                  <div className="mt-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void refreshOnboardingState()}>
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {onboardingState === 'error' && (
                <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                  Couldn’t refresh verification status right now. You can continue onboarding and retry later.
                </div>
              )}

              {error && (
                <p className="text-sm font-medium text-destructive">{error}</p>
              )}

              <Button type="submit" disabled={isFormDisabled || isLoading} className="w-full">
                {onboardingState === 'loading'
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


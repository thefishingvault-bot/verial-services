
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import * as z from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const categories = [
  'cleaning',
  'plumbing',
  'gardening',
  'it_support',
  'accounting',
  'detailing',
  'other',
] as const;

const pricingTypes = ['fixed', 'from', 'quote'] as const;

const formSchema = z
  .object({
    title: z.string().min(5, {
      message: 'Title must be at least 5 characters long.',
    }),
    category: z.enum(categories),
    pricingType: z.enum(pricingTypes),
    price: z.number().nonnegative(),
    priceNote: z.string().max(500).optional(),
    description: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.pricingType !== 'quote' && (!value.price || value.price <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Price must be a positive number.',
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

type ProviderServiceNewClientProps = {
  providerStatus: 'pending' | 'approved' | 'rejected';
  providerBaseRegion: string | null;
  providerBaseSuburb: string | null;
  providerServiceRadiusKm: number;
  providerChargesGst: boolean;
  blockedReason?: string;
};

export function ProviderServiceNewClient({
  providerStatus,
  providerBaseRegion,
  providerBaseSuburb,
  providerServiceRadiusKm,
  providerChargesGst,
  blockedReason,
}: ProviderServiceNewClientProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  const missingServiceArea = !providerBaseRegion || !providerBaseSuburb;
  const isCreationBlocked = providerStatus === 'rejected' || !!blockedReason || missingServiceArea;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      title: '',
      category: 'cleaning',
      pricingType: 'fixed',
      price: 0,
      priceNote: '',
      description: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (isCreationBlocked) return;

    setIsLoading(true);
    setApiError(null);

    try {
      const priceInCents = values.pricingType === 'quote' ? null : Math.round(values.price * 100);

      const res = await fetch('/api/services/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          pricingType: values.pricingType,
          priceInCents,
          priceNote: values.priceNote,
          category: values.category,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Failed to create service.');
        throw new Error(errorText || 'Failed to create service.');
      }

      toast({ title: 'Service created', description: 'Saved as a draft in Your Services.' });
      router.push('/dashboard/provider/services');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create service.';
      setApiError(message);
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      {providerStatus === 'pending' && !blockedReason && (
        <div className="mb-6">
          <Alert>
            <AlertTitle>Awaiting approval</AlertTitle>
            <AlertDescription>
              You can create and edit draft services now. Publishing will be available once your provider application is approved.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {(providerStatus === 'rejected' || blockedReason) && (
        <div className="mb-6">
          <Alert variant="destructive">
            <AlertTitle>Service creation unavailable</AlertTitle>
            <AlertDescription>
              {blockedReason ??
                'Your provider application is not eligible to publish services right now. Please contact support or an admin.'}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {missingServiceArea && !blockedReason && providerStatus !== 'rejected' && (
        <div className="mb-6">
          <Alert variant="destructive">
            <AlertTitle>Set your service area first</AlertTitle>
            <AlertDescription>
              Add your base region/suburb in{' '}
              <Link href="/dashboard/provider/profile" className="underline">
                Provider Profile
              </Link>{' '}
              to create services.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create a New Service</CardTitle>
          <CardDescription>Enter the details for your service. It will start as a draft.</CardDescription>
        </CardHeader>
        <CardContent>
          {!missingServiceArea && (
            <div className="mb-6">
              <p className="text-sm text-muted-foreground">
                Service area:{' '}
                <span className="font-medium text-foreground">
                  {providerBaseSuburb}, {providerBaseRegion}
                </span>{' '}
                (within {providerServiceRadiusKm} km)
              </p>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Professional House Cleaning"
                        {...field}
                        disabled={isCreationBlocked}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isCreationBlocked}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat} className="capitalize">
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pricingType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pricing</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isCreationBlocked}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pricing type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed price</SelectItem>
                          <SelectItem value="from">From (starting at)</SelectItem>
                          <SelectItem value="quote">Quote required</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {form.watch('pricingType') === 'fixed' && 'Customers see an exact price.'}
                        {form.watch('pricingType') === 'from' && 'Customers see “From $X”.'}
                        {form.watch('pricingType') === 'quote' &&
                          'Customers request a quote; you set the final price on accept.'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch('pricingType') === 'from' ? 'Starting price (in NZD)' : 'Price (in NZD)'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={form.watch('pricingType') === 'quote' ? 'Quote required' : 'e.g., 150.00'}
                        {...field}
                        disabled={isCreationBlocked || form.watch('pricingType') === 'quote'}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      {form.watch('pricingType') === 'quote'
                        ? 'No upfront price required.'
                        : (providerChargesGst ? 'Prices include GST (15%).' : 'Prices exclude GST (15%).')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priceNote"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pricing note (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Depends on scope, materials, travel"
                        {...field}
                        disabled={isCreationBlocked}
                      />
                    </FormControl>
                    <FormDescription>Short note shown to customers alongside the price.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={5}
                        placeholder="Describe what's included, exclusions, and any requirements."
                        {...field}
                        disabled={isCreationBlocked}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {apiError && <p className="text-sm text-destructive">{apiError}</p>}

              <Button type="submit" className="w-full" disabled={isLoading || isCreationBlocked}>
                {isLoading ? 'Creating…' : 'Create Service'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

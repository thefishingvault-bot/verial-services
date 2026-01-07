'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { NZ_REGIONS } from '@/lib/data/nz-locations';

const categories = [
  'cleaning',
  'plumbing',
  'gardening',
  'it_support',
  'accounting',
  'detailing',
  'other',
] as const;

const formSchema = z.object({
  title: z.string().min(5, {
    message: 'Title must be at least 5 characters long.',
  }),
  category: z.enum(categories),
  price: z.number().positive({
    message: 'Price must be a positive number.',
  }),
  description: z.string().optional(),
  region: z.string().min(1, { message: 'Region is required' }),
  suburb: z.string().min(1, { message: 'Suburb is required' }),
});

type FormValues = z.infer<typeof formSchema>;

type ProviderServiceNewClientProps = {
  providerStatus: 'pending' | 'approved' | 'rejected';
  blockedReason?: string;
};

export function ProviderServiceNewClient({ providerStatus, blockedReason }: ProviderServiceNewClientProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  const isCreationBlocked = providerStatus === 'rejected' || !!blockedReason;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      title: '',
      category: 'cleaning',
      price: 0,
      description: '',
      region: '',
      suburb: '',
    },
  });

  const region = form.watch('region');
  const suburbs = region ? NZ_REGIONS[region] ?? [] : [];

  const onSubmit = async (values: FormValues) => {
    if (isCreationBlocked) return;

    setIsLoading(true);
    setApiError(null);

    try {
      const priceInCents = Math.round(values.price * 100);

      const res = await fetch('/api/services/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          priceInCents,
          category: values.category,
          region: values.region,
          suburb: values.suburb,
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
              {blockedReason ?? 'Your provider application is not eligible to publish services right now. Please contact support or an admin.'}
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Professional House Cleaning" {...field} disabled={isCreationBlocked} />
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
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (in NZD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g., 150.00"
                          {...field}
                          disabled={isCreationBlocked}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>Prices include GST (15%).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Tell customers about your service..."
                        className="resize-none"
                        rows={5}
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
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue('suburb', '');
                        }}
                        value={field.value}
                        disabled={isCreationBlocked}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.keys(NZ_REGIONS).map((regionName) => (
                            <SelectItem key={regionName} value={regionName}>
                              {regionName}
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
                  name="suburb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Suburb</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isCreationBlocked || !region}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={region ? 'Select a suburb' : 'Select a region first'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suburbs.map((suburbName) => (
                            <SelectItem key={suburbName} value={suburbName}>
                              {suburbName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, type Resolver, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import Link from 'next/link';
import { Loader2, ArrowLeft } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
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
  title: z.string().min(5, 'Title must be at least 5 characters long.'),
  category: z.enum(categories),
  price: z.number().positive('Price must be a positive number.'),
  description: z.string().optional(),
  chargesGst: z.boolean(),
  region: z.string().min(1, 'Region is required'),
  suburb: z.string().min(1, 'Suburb is required'),
  isPublished: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

type ProviderEditServiceClientProps = {
  providerStatus: 'pending' | 'approved' | 'rejected';
};

export function ProviderEditServiceClient({ providerStatus }: ProviderEditServiceClientProps) {
  const params = useParams();
  const serviceId = params.serviceId as string;
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const canPublish = providerStatus === 'approved';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      title: '',
      category: 'cleaning',
      price: 0,
      description: '',
      chargesGst: true,
      region: '',
      suburb: '',
      isPublished: false,
    },
  });

  const region = form.watch('region');
  const suburbs = useMemo(() => (region ? NZ_REGIONS[region] ?? [] : []), [region]);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/services/${serviceId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch service');
        return res.json();
      })
      .then((data) => {
        form.reset({
          title: data.title,
          category: data.category,
          price: data.priceInCents / 100,
          description: data.description || '',
          chargesGst: data.chargesGst,
          region: data.region || '',
          suburb: data.suburb || '',
          isPublished: canPublish ? (data.isPublished ?? false) : false,
        });
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to fetch service.';
        toast({ variant: 'destructive', title: 'Error', description: message });
        router.push('/dashboard/provider/services');
      });
  }, [serviceId, form, router, toast, canPublish]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setIsSaving(true);
    try {
      const priceInCents = Math.round(values.price * 100);
      const res = await fetch(`/api/services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          priceInCents,
          category: values.category,
          chargesGst: values.chargesGst,
          region: values.region,
          suburb: values.suburb,
          isPublished: canPublish ? values.isPublished : false,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({ title: 'Service Updated', description: 'Your changes have been saved.' });
      router.push('/dashboard/provider/services');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update service.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <Button variant="ghost" asChild className="pl-0">
          <Link href="/dashboard/provider/services">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
          </Link>
        </Button>
      </div>

      {!canPublish && (
        <div className="mb-6">
          <Alert>
            <AlertTitle>Awaiting approval</AlertTitle>
            <AlertDescription>
              You can edit this draft service now, but publishing is disabled until your provider application is approved.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Edit Service</CardTitle>
              <CardDescription>Update your service details, pricing, and visibility.</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Status: {form.watch('isPublished') ? 'Published' : 'Unpublished'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Title</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
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
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="chargesGst"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Includes GST</FormLabel>
                      <FormDescription>Does this price include 15% GST?</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Publish service</FormLabel>
                      <FormDescription>
                        Toggle whether this service is visible in marketplace search and public pages.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canPublish} />
                    </FormControl>
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
                      <Textarea rows={5} {...field} />
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
                        disabled={!region}
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

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

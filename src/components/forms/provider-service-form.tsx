'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver, type SubmitHandler } from 'react-hook-form';
import * as z from 'zod';

import { Loader2, ArrowLeft, Upload, Trash2 } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
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

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const maxImageBytes = 5 * 1024 * 1024;

const formSchema = z
  .object({
    coverImageUrl: z.string().url().nullable().optional(),
    title: z.string().min(5, { message: 'Title must be at least 5 characters long.' }),
    category: z.enum(categories),
    pricingType: z.enum(pricingTypes),
    price: z.number().nonnegative(),
    priceNote: z.string().max(500).optional(),
    description: z.string().optional(),
    isPublished: z.boolean().optional(),
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

type Mode = 'create' | 'edit';

type ProviderServiceFormProps = {
  mode: Mode;
  providerStatus: 'pending' | 'approved' | 'rejected';
  providerBaseRegion: string | null;
  providerBaseSuburb: string | null;
  providerServiceRadiusKm: number;
  providerChargesGst: boolean;
  blockedReason?: string;
};

type ServiceApiResponse = {
  id: string;
  title: string;
  description: string | null;
  category: (typeof categories)[number];
  pricingType: (typeof pricingTypes)[number];
  priceInCents: number | null;
  priceNote: string | null;
  coverImageUrl: string | null;
  isPublished?: boolean;
};

export function ProviderServiceForm(props: ProviderServiceFormProps) {
  const {
    mode,
    providerStatus,
    providerBaseRegion,
    providerBaseSuburb,
    providerServiceRadiusKm,
    providerChargesGst,
    blockedReason,
  } = props;

  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();

  const serviceId = useMemo(() => {
    if (mode !== 'edit') return null;
    const raw = (params as any)?.serviceId as string | undefined;
    return raw ?? null;
  }, [mode, params]);

  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [isSaving, setIsSaving] = useState(false);
  const [coverUploadState, setCoverUploadState] = useState<
    'idle' | 'validating' | 'presigning' | 'uploading' | 'saving' | 'error'
  >('idle');
  const [coverError, setCoverError] = useState<string | null>(null);

  const missingServiceArea = !providerBaseRegion || !providerBaseSuburb;
  const isBlockedByStatus = providerStatus === 'rejected' || !!blockedReason;
  const isFormBlocked = missingServiceArea || isBlockedByStatus;

  const canPublish = providerStatus === 'approved';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      coverImageUrl: null,
      title: '',
      category: 'cleaning',
      pricingType: 'fixed',
      price: 0,
      priceNote: '',
      description: '',
      isPublished: false,
    },
  });

  useEffect(() => {
    if (mode !== 'edit' || !serviceId) return;

    setIsLoading(true);
    fetch(`/api/services/${serviceId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch service');
        return res.json();
      })
      .then((data: ServiceApiResponse) => {
        form.reset({
          coverImageUrl: data.coverImageUrl ?? null,
          title: data.title,
          category: data.category,
          pricingType: data.pricingType ?? 'fixed',
          price: data.priceInCents ? data.priceInCents / 100 : 0,
          priceNote: data.priceNote ?? '',
          description: data.description || '',
          isPublished: canPublish ? (data.isPublished ?? false) : false,
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to fetch service.';
        toast({ variant: 'destructive', title: 'Error', description: message });
        router.push('/dashboard/provider/services');
      })
      .finally(() => setIsLoading(false));
  }, [mode, serviceId, canPublish, form, router, toast]);

  const handleCoverFileSelected = async (file: File) => {
    setCoverError(null);

    setCoverUploadState('validating');
    if (!allowedImageTypes.includes(file.type as any)) {
      setCoverUploadState('error');
      setCoverError('Invalid file type. Please upload a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > maxImageBytes) {
      setCoverUploadState('error');
      setCoverError('File size exceeds 5MB limit.');
      return;
    }

    try {
      setCoverUploadState('presigning');
      const presignResponse = await fetch('/api/uploads/presign-service-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: serviceId ?? undefined,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!presignResponse.ok) {
        throw new Error(await presignResponse.text());
      }

      const { uploadUrl, publicUrl } = (await presignResponse.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };

      setCoverUploadState('uploading');
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file.');
      }

      // Create mode: store URL in form state and include it on submit.
      if (mode === 'create') {
        form.setValue('coverImageUrl', publicUrl, { shouldDirty: true });
        setCoverUploadState('idle');
        return;
      }

      // Edit mode: persist immediately.
      if (!serviceId) {
        throw new Error('Missing serviceId for cover upload.');
      }

      setCoverUploadState('saving');
      const updateResponse = await fetch('/api/services/update-cover', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, publicUrl }),
      });
      if (!updateResponse.ok) {
        throw new Error(await updateResponse.text());
      }

      form.setValue('coverImageUrl', publicUrl, { shouldDirty: true });
      setCoverUploadState('idle');

      toast({ title: 'Cover image updated' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload cover image.';
      setCoverUploadState('error');
      setCoverError(message);
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const handleRemoveCover = async () => {
    setCoverError(null);

    if (mode === 'create') {
      form.setValue('coverImageUrl', null, { shouldDirty: true });
      return;
    }

    if (!serviceId) {
      setCoverError('Missing serviceId.');
      return;
    }

    try {
      setCoverUploadState('saving');
      const updateResponse = await fetch('/api/services/update-cover', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, publicUrl: null }),
      });
      if (!updateResponse.ok) {
        throw new Error(await updateResponse.text());
      }

      form.setValue('coverImageUrl', null, { shouldDirty: true });
      toast({ title: 'Cover image removed' });
      setCoverUploadState('idle');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove cover image.';
      setCoverUploadState('error');
      setCoverError(message);
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (isFormBlocked) return;

    setIsSaving(true);
    try {
      const priceInCents = values.pricingType === 'quote' ? null : Math.round(values.price * 100);

      if (mode === 'create') {
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
            coverImageUrl: values.coverImageUrl ?? null,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => 'Failed to create service.');
          throw new Error(errorText || 'Failed to create service.');
        }

        toast({ title: 'Service created', description: 'Saved as a draft in Your Services.' });
        router.push('/dashboard/provider/services');
        router.refresh();
        return;
      }

      if (!serviceId) {
        throw new Error('Missing serviceId.');
      }

      const res = await fetch(`/api/services/${serviceId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: values.title,
            description: values.description,
            pricingType: values.pricingType,
            priceInCents,
            priceNote: values.priceNote,
            category: values.category,
            isPublished: canPublish ? (values.isPublished ?? false) : false,
            coverImageUrl: values.coverImageUrl ?? null,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({ title: 'Service updated', description: 'Your changes have been saved.' });
      router.push('/dashboard/provider/services');
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save service.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsSaving(false);
    }
  };

  const coverImageUrl = form.watch('coverImageUrl') ?? null;

  const isCoverBusy =
    coverUploadState === 'validating' ||
    coverUploadState === 'presigning' ||
    coverUploadState === 'uploading' ||
    coverUploadState === 'saving';

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      {mode === 'edit' && (
        <div className="mb-6">
          <Button variant="ghost" asChild className="pl-0">
            <Link href="/dashboard/provider/services">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
            </Link>
          </Button>
        </div>
      )}

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
            <AlertTitle>Service editing unavailable</AlertTitle>
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
              to {mode === 'create' ? 'create services' : 'save changes'}.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{mode === 'create' ? 'Create a New Service' : 'Edit Service'}</CardTitle>
              <CardDescription>
                {mode === 'create'
                  ? 'Enter the details for your service. It will start as a draft.'
                  : 'Update your service details, pricing, and visibility.'}
              </CardDescription>
            </div>
            {mode === 'edit' && (
              <div className="flex flex-col items-end gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Status: {form.watch('isPublished') ? 'Published' : 'Unpublished'}
                </span>
              </div>
            )}
          </div>
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
              {/* Cover image */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Cover image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, or WEBP. Max 5MB.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isFormBlocked || isCoverBusy}
                      onClick={() => document.getElementById('service-cover-file')?.click()}
                    >
                      {isCoverBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isFormBlocked || isCoverBusy || !coverImageUrl}
                      onClick={handleRemoveCover}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>

                <input
                  id="service-cover-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void handleCoverFileSelected(f);
                    e.currentTarget.value = '';
                  }}
                />

                <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
                  {coverImageUrl ? (
                    <Image src={coverImageUrl} alt="Service cover" fill className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-xs text-muted-foreground">No cover image</span>
                    </div>
                  )}
                </div>

                {coverError && <p className="text-sm text-destructive">{coverError}</p>}
              </div>

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
                        disabled={isFormBlocked}
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isFormBlocked}>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isFormBlocked}>
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
                        disabled={isFormBlocked || form.watch('pricingType') === 'quote'}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      {form.watch('pricingType') === 'quote'
                        ? 'No upfront price required.'
                        : providerChargesGst
                          ? 'Prices include GST (15%).'
                          : 'Prices exclude GST (15%).'}
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
                        disabled={isFormBlocked}
                      />
                    </FormControl>
                    <FormDescription>Short note shown to customers alongside the price.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === 'edit' && (
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
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                          disabled={!canPublish || isFormBlocked}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

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
                        disabled={isFormBlocked}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isSaving || isFormBlocked}>
                {mode === 'create' ? (isSaving ? 'Creating…' : 'Create Service') : (isSaving ? 'Saving…' : 'Save Changes')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

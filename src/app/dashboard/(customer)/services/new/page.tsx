'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';

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
import { Separator } from '@/components/ui/separator';
import { ImageUploader } from '@/components/forms/image-uploader';
import { useToast } from '@/components/ui/use-toast';
import { NZ_REGIONS } from '@/lib/data/nz-locations';

// As per schema: serviceCategoryEnum
const categories = [
  'cleaning',
  'plumbing',
  'gardening',
  'it_support',
  'accounting',
  'detailing',
  'other',
] as const;

// Define the form validation schema with Zod
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

export default function NewServicePage() {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // --- New state for 2-step flow ---
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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

  // --- Step 1: Create the service (text details) ---
  const onSubmit = async (values: FormValues) => {
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
          priceInCents: priceInCents,
          category: values.category,
          region: values.region,
          suburb: values.suburb,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to create service.');
      }

      const newService = await res.json();
      setServiceId(newService.id); // <-- This triggers the UI to show the uploader
      setIsLoading(false);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create service.';
      setApiError(message);
      setIsLoading(false);
    }
  };

  // --- Step 2: Handle image upload completion ---
  const handleUploadComplete = (publicUrl: string) => {
    setCoverImageUrl(publicUrl);
    toast({ title: 'Image uploaded successfully!' });
    // Optionally, redirect after a short delay
    setTimeout(() => {
      router.push('/dashboard/bookings/provider'); // Go to provider bookings
    }, 1000);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Create a New Service</CardTitle>
          <CardDescription>
            Step {serviceId ? '2' : '1'} of 2: {serviceId ? 'Upload a cover image' : 'Enter service details'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* --- STEP 1: Details Form --- */}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className={`space-y-6 ${serviceId ? 'hidden' : 'block'}`}
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Professional House Cleaning" {...field} />
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
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Prices include GST (15%).
                      </FormDescription>
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
                      <Select onValueChange={field.onChange} value={field.value} disabled={!region}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={region ? 'Select a suburb' : 'Choose a region first'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suburbs.map((suburb) => (
                            <SelectItem key={suburb} value={suburb}>
                              {suburb}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {apiError && (
                <p className="text-sm font-medium text-destructive">{apiError}</p>
              )}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? 'Creating...' : 'Continue to Step 2'}
              </Button>
            </form>
          </Form>

          {/* --- STEP 2: Image Uploader --- */}
          {serviceId && (
            <div className="space-y-4">
              <Separator />
              <p className="font-semibold text-lg">Step 2: Upload Cover Image</p>
              {coverImageUrl ? (
                <div className="mt-4">
                  <p className="text-green-600 font-medium mb-2">Upload Successful!</p>
                  <Image
                    src={coverImageUrl}
                    alt="Service Cover Image"
                    width={400}
                    height={200}
                    className="rounded-md object-cover aspect-video"
                  />
                </div>
              ) : (
                <ImageUploader
                  serviceId={serviceId}
                  onUploadComplete={handleUploadComplete}
                />
              )}
              <Button variant="outline" onClick={() => router.push('/dashboard/bookings/provider')} className="w-full">
                Skip and finish later
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


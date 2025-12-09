'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import { Switch } from '@/components/ui/switch';
import { ImageUploader } from '@/components/forms/image-uploader';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import Link from 'next/link';
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
});

type FormValues = z.infer<typeof formSchema>;

export default function EditServicePage() {
  const params = useParams();
  const serviceId = params.serviceId as string;
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // @ts-ignore Zod v4 resolver typing mismatch
    resolver: zodResolver(formSchema as any) as any,
    defaultValues: {
      title: '',
      category: 'cleaning',
      price: 0,
      description: '',
      chargesGst: true,
      region: '',
      suburb: '',
    },
  });

  const region = form.watch('region');
  const suburbs = region ? NZ_REGIONS[region] ?? [] : [];

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
        });
        setCoverImageUrl(data.coverImageUrl ?? null);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to fetch service.';
        toast({ variant: 'destructive', title: 'Error', description: message });
        router.push('/dashboard/services');
      });
  }, [serviceId, form, router, toast]);

  const onSubmit = async (values: FormValues) => {
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
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      toast({ title: 'Service Updated', description: 'Your changes have been saved.' });
      router.push('/dashboard/services');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update service.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadComplete = (publicUrl: string) => {
    setCoverImageUrl(publicUrl);
    toast({ title: 'Image Updated' });
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
          <Link href="/dashboard/services">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Service</CardTitle>
          <CardDescription>Update your service details and pricing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
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

              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}
              </Button>
            </form>
          </Form>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Cover Image</h3>
            {coverImageUrl && (
              <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <Image src={coverImageUrl} alt="Cover" fill className="object-cover" />
              </div>
            )}
            <ImageUploader serviceId={serviceId} onUploadComplete={handleUploadComplete} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


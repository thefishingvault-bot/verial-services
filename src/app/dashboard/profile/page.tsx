'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useUser, UserProfile } from '@clerk/nextjs';
import Image from 'next/image';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { AvatarUploader } from '@/components/forms/avatar-uploader';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

// Clerk appearance for Account & Security tab
const clerkAppearance = {
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border-none bg-transparent',
    headerTitle: 'text-xl font-semibold text-card-foreground',
    headerSubtitle: 'hidden',
    profileSectionTitleText: 'text-lg font-semibold text-card-foreground',
    formFieldLabel: 'text-sm font-medium',
    formFieldInput:
      'h-10 border-border bg-background focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 rounded-md',
    formButtonPrimary: 'bg-primary text-primary-foreground h-10 hover:bg-primary/90',
    formButtonReset: 'bg-destructive text-destructive-foreground h-10 hover:bg-destructive/90',
    formButtonSecondary: 'bg-secondary text-secondary-foreground h-9 hover:bg-secondary/80',
    profileSection__danger: 'mt-6',
    profileSectionTitle__danger: 'text-destructive',
    profileSectionContent__danger: 'border-destructive',
  },
} as const;

// Define the form validation schema
const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  businessName: z.string().optional(),
  handle: z
    .string()
    .regex(/^[a-z0-9-]+$/, {
      message: 'Handle must only contain lowercase letters, numbers, and hyphens.',
    })
    .optional(),
  bio: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ProfilePage() {
  const { user } = useUser();
  const { toast } = useToast();
  const isProvider = user?.publicMetadata?.role === 'provider';

  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      avatarUrl: '',
      businessName: '',
      handle: '',
      bio: '',
    },
  });

  // Fetch existing profile data
  useEffect(() => {
    setIsLoading(true);
    fetch('/api/profile/get')
      .then((res) => res.json())
      .then((data) => {
        form.reset({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || user?.primaryEmailAddress?.emailAddress || '',
          avatarUrl: data.avatarUrl || '',
          businessName: data.provider?.businessName || '',
          handle: data.provider?.handle || '',
          bio: data.provider?.bio || '',
        });
        setUserRole(data.role ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        setError('Failed to load profile data.');
        setIsLoading(false);
      });
  }, [form, user]);
  const handleAvatarUpload = async (publicUrl: string) => {
    form.setValue('avatarUrl', publicUrl, { shouldDirty: true });
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: publicUrl }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      await user?.reload();
      toast({
        title: 'Avatar Updated',
        description: 'Your profile picture has been updated.',
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong while updating your avatar.';
      setError(message);
      toast({
        variant: 'destructive',
        title: 'Avatar update failed',
        description: message,
      });
    } finally {
      setIsSaving(false);
    }
  };



  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        firstName: values.firstName,
        lastName: values.lastName,
        bio: values.bio ?? undefined,
        businessName: isProvider ? values.businessName : undefined,
        handle: isProvider ? values.handle : undefined,
        avatarUrl: values.avatarUrl || undefined,
      };

      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      await user?.reload();
      toast({
        title: 'Profile Updated',
        description: 'Your changes have been saved successfully.',
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const avatarUrl = form.watch('avatarUrl');
  const roleLabel = isProvider || userRole === 'provider' ? 'Provider' : 'Customer';


  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-verial-light">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-verial-light py-10 md:py-16">
      <div className="container flex justify-center">
        <div className="w-full max-w-2xl">
          <Tabs defaultValue="profile" className="w-full">
            <div className="mb-4 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
              <p className="text-sm text-muted-foreground">
                Manage your profile information and account settings.
              </p>
            </div>

            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Account &amp; Security</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle>Your Profile</CardTitle>
                  <CardDescription>Manage how you appear to other users.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-16 overflow-hidden rounded-full border bg-muted">
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt="Profile avatar"
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                            {user?.firstName?.[0]}
                            {user?.lastName?.[0]}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{user?.fullName ?? 'Your name'}</p>
                        <p className="text-xs text-muted-foreground">
                          This image is shown on your profile and bookings.
                        </p>
                      </div>
                    </div>
                    <AvatarUploader onUploadComplete={handleAvatarUpload} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Email</p>
                      <p className="text-sm">
                        {form.getValues('email') || user?.primaryEmailAddress?.emailAddress}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Account type</p>
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs">
                        {roleLabel}
                      </Badge>
                    </div>
                  </div>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {isProvider && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="businessName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Business Name</FormLabel>
                                <FormDescription>
                                  This name is shown on your public profile.
                                </FormDescription>
                                <FormControl>
                                  <Input placeholder="e.g. Verial Plumbing Co." {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="handle"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Handle</FormLabel>
                                <FormDescription>
                                  Lowercase, numbers, and hyphens only. Used in your public URL.
                                </FormDescription>
                                <FormControl>
                                  <Input placeholder="e.g. verial-plumbing" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {isProvider && (
                        <FormField
                          control={form.control}
                          name="bio"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Provider Bio</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Tell customers about you and your services..."
                                  className="resize-none"
                                  rows={5}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {error && (
                        <p className="text-sm font-medium text-destructive">{error}</p>
                      )}

                      <Button type="submit" disabled={isSaving} className="w-full">
                        {isSaving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          'Save Changes'
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security">
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle>Account &amp; Security</CardTitle>
                  <CardDescription>
                    Manage your password, email, and security settings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserProfile appearance={clerkAppearance} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}


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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner'; // Use Sonner
import { AvatarUploader } from '@/components/forms/avatar-uploader'; // New
import { Badge } from '@/components/ui/badge'; // New

// --- Clerk Appearance (same as before) ---
const clerkAppearance = {
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border-none bg-transparent',
    headerTitle: 'text-xl font-semibold text-card-foreground',
    headerSubtitle: 'hidden',
    profileSectionTitleText: 'text-lg font-semibold text-card-foreground',
    formFieldLabel: 'text-sm font-medium',
    formFieldInput: 'h-10 border-border bg-background focus:ring-primary focus:ring-1 rounded-md',
    formButtonPrimary: 'bg-primary text-primary-foreground h-10 hover:bg-primary/90',
    formButtonReset: 'bg-destructive text-destructive-foreground h-10 hover:bg-destructive/90',
    formButtonSecondary: 'bg-secondary text-secondary-foreground h-9 hover:bg-secondary/80',
    profileSection__danger: 'mt-6',
    profileSectionTitle__danger: 'text-destructive',
    profileSectionContent__danger: 'border-destructive',
  },
};

// --- Profile Form Schema (now includes all fields) ---
const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional(), // Read-only
  avatarUrl: z.string().url().optional().or(z.literal('')),

  // Provider fields
  businessName: z.string().optional(),
  handle: z.string().regex(/^[a-z0-9-]+$/, {
      message: 'Handle must only contain lowercase letters, numbers, and hyphens.',
    }).optional().or(z.literal('')),
  bio: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ProfilePage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === 'provider';
  const userRole = user?.publicMetadata?.role as string || 'customer';

  const [isLoading, setIsLoading] = useState(true);
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
          email: data.email || '',
          avatarUrl: data.avatarUrl || user?.imageUrl || '',
          businessName: data.provider?.businessName || '',
          handle: data.provider?.handle || '',
          bio: data.provider?.bio || '',
        });
        setIsLoading(false);
      })
      .catch(() => {
        setError('Failed to load profile data.');
        setIsLoading(false);
      });
  }, [form, user]);

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values), // Send all form values
      });
      if (!res.ok) throw new Error(await res.text());

      await user?.reload();

      toast.success('Profile Updated', {
        description: 'Your changes have been saved successfully.',
      });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Avatar Upload Handler (Step 1) ---
  const handleAvatarUpload = async (publicUrl: string) => {
    // Set the value in the form
    form.setValue('avatarUrl', publicUrl, { shouldDirty: true });

    // --- Auto-save just the avatar ---
    setIsSaving(true);
    try {
      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: publicUrl }),
      });
      if (!res.ok) throw new Error(await res.text());

      await user?.reload(); // Reload clerk user to show new pic
      toast.success('Avatar Updated!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex p-8 justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Account & Security</TabsTrigger>
        </TabsList>

        {/* --- Profile Tab --- */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>
                Manage your public information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                  {/* --- Avatar Field --- */}
                  <FormField
                    control={form.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profile Picture</FormLabel>
                        <FormControl>
                          <div className='flex items-center gap-4'>
                            <div className="relative h-16 w-16 rounded-full overflow-hidden border">
                               <Image
                                 src={field.value || '/default-avatar.png'} // Add a placeholder
                                 alt="Avatar"
                                 fill
                                 className="object-cover"
                               />
                            </div>
                            <AvatarUploader onUploadComplete={handleAvatarUpload} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* --- Read-only Email & Role --- */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input {...field} readOnly disabled />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <Badge variant="outline" className="w-fit mt-2 capitalize h-10 flex items-center px-4">
                        {userRole}
                      </Badge>
                    </FormItem>
                  </div>

                  {/* --- Name Fields --- */}
                  <div className="grid grid-cols-2 gap-4">
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

                  {/* --- Provider-Only Fields --- */}
                  {isProvider && (
                    <>
                      <FormField
                        control={form.control}
                        name="businessName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
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
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormDescription>Your public profile URL: /p/{field.value}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Provider Bio</FormLabel>
                            <FormControl>
                              <Textarea rows={5} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {error && <p className="text-sm font-medium text-destructive">{error}</p>}

                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Account & Security Tab --- */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Account & Security</CardTitle>
              <CardDescription>
                Manage your password, email, and phone number.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserProfile appearance={clerkAppearance} />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}


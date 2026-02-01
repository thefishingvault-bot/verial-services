"use client";

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUser } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { NZ_REGIONS } from "@/lib/nz-regions";

const formSchema = z.object({
  username: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[a-z0-9_]{3,20}$/.test(v), "Use 3–20 lowercase letters, numbers, and underscores"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  suburb: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postcode: z.string().optional(),
  bio: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ProfilePage() {
  const { user } = useUser();
  const isProvider = user?.publicMetadata?.role === "provider";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbRole, setDbRole] = useState<string | null>(null);
  const [acceptedTermsAt, setAcceptedTermsAt] = useState<string | null>(null);
  const [acceptedPrivacyAt, setAcceptedPrivacyAt] = useState<string | null>(null);
  const [confirmed18PlusAt, setConfirmed18PlusAt] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      username: "",
      firstName: "",
      lastName: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      suburb: "",
      city: "",
      region: "",
      postcode: "",
      bio: "",
    },
  });

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/profile/get")
      .then((res) => res.json())
      .then((data) => {
        setDbRole(typeof data?.role === "string" ? data.role : null);
        setAcceptedTermsAt(typeof data?.acceptedTermsAt === "string" ? data.acceptedTermsAt : null);
        setAcceptedPrivacyAt(typeof data?.acceptedPrivacyAt === "string" ? data.acceptedPrivacyAt : null);
        setConfirmed18PlusAt(typeof data?.confirmed18PlusAt === "string" ? data.confirmed18PlusAt : null);

        form.reset({
          username: data.username || "",
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          phone: data.phone || "",
          addressLine1: data.addressLine1 || "",
          addressLine2: data.addressLine2 || "",
          suburb: data.suburb || "",
          city: data.city || "",
          region: data.region || "",
          postcode: data.postcode || "",
          bio: data.provider?.bio || "",
        });
        setIsLoading(false);
      })
      .catch(() => {
        setError("Failed to load profile data.");
        setIsLoading(false);
      });
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    setError(null);

    // Enforce that customers keep required onboarding fields populated.
    // (Providers/admins are not gated on customer profile completion.)
    const isCustomer = dbRole !== "provider" && dbRole !== "admin";
    if (isCustomer) {
      const required: Array<keyof FormValues> = [
        "username",
        "phone",
        "addressLine1",
        "suburb",
        "city",
        "region",
        "postcode",
      ];
      let hasAnyError = false;
      for (const key of required) {
        const v = String(values[key] ?? "").trim();
        if (!v) {
          form.setError(key, { type: "validate", message: "This field is required" });
          hasAnyError = true;
        }
      }
      if (hasAnyError) {
        setIsSaving(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/profile/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update profile.");
      }

      await user?.reload();

      toast.success("Profile updated", {
        description: "Your changes have been saved successfully.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex p-8 justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Account &amp; Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>Manage your public information and contact details.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="your_username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First name</FormLabel>
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
                          <FormLabel>Last name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. 021 123 4567" inputMode="tel" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 gap-4">
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address line 1</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Street address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address line 2 (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Apartment, unit, etc." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="suburb"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Suburb</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="region"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Region</FormLabel>
                            <Select value={field.value || ""} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a region" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {NZ_REGIONS.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
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
                        name="postcode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postcode</FormLabel>
                            <FormControl>
                              <Input {...field} inputMode="numeric" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {(acceptedTermsAt || acceptedPrivacyAt || confirmed18PlusAt) && (
                    <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
                      <div className="font-medium text-foreground">Consents</div>
                      <div className="mt-1 space-y-1">
                        {acceptedTermsAt && <div>Terms accepted: {new Date(acceptedTermsAt).toLocaleString()}</div>}
                        {acceptedPrivacyAt && <div>Privacy accepted: {new Date(acceptedPrivacyAt).toLocaleString()}</div>}
                        {confirmed18PlusAt && <div>18+ confirmed: {new Date(confirmed18PlusAt).toLocaleString()}</div>}
                      </div>
                    </div>
                  )}

                  {isProvider && (
                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider bio</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={5}
                              className="resize-none"
                              placeholder="Tell customers about you and your services..."
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
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Account &amp; Security</CardTitle>
              <CardDescription>
                Manage your password, email, and other account security settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Account &amp; security controls will be added here using Clerk components.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



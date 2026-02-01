"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { submitOnboarding } from "@/lib/onboarding/actions";
import { NZ_REGIONS } from "@/lib/nz-regions";

const formSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-z0-9_]{3,20}$/, "Use lowercase letters, numbers, and underscores"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone is required"),

  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().optional(),
  suburb: z.string().min(1, "Suburb is required"),
  city: z.string().min(1, "City is required"),
  region: z.string().min(1, "Region is required"),
  postcode: z.string().min(1, "Postcode is required"),

  acceptTerms: z.boolean().refine((v) => v === true, "You must accept the terms"),
  acceptPrivacy: z.boolean().refine((v) => v === true, "You must accept the privacy policy"),
  confirm18Plus: z.boolean().refine((v) => v === true, "You must confirm you are 18+"),
});

type FormValues = z.infer<typeof formSchema>;

export function OnboardingForm(props: {
  initialValues?: Partial<
    Pick<
      FormValues,
      | "username"
      | "firstName"
      | "lastName"
      | "phone"
      | "addressLine1"
      | "addressLine2"
      | "suburb"
      | "city"
      | "region"
      | "postcode"
    >
  >;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [checking, setChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availability, setAvailability] = useState<null | { available: boolean; normalized?: string; message?: string }>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    mode: "onChange",
    defaultValues: {
      username: props.initialValues?.username ?? "",
      firstName: props.initialValues?.firstName ?? "",
      lastName: props.initialValues?.lastName ?? "",
      phone: props.initialValues?.phone ?? "",
      addressLine1: props.initialValues?.addressLine1 ?? "",
      addressLine2: props.initialValues?.addressLine2 ?? "",
      suburb: props.initialValues?.suburb ?? "",
      city: props.initialValues?.city ?? "",
      region: props.initialValues?.region ?? "",
      postcode: props.initialValues?.postcode ?? "",
      acceptTerms: false,
      acceptPrivacy: false,
      confirm18Plus: false,
    },
  });

  const username = form.watch("username");
  const normalizedPreview = useMemo(() => username.trim().toLowerCase(), [username]);

  useEffect(() => {
    setAvailability(null);
  }, [normalizedPreview]);

  const checkAvailability = async () => {
    const candidate = normalizedPreview;
    if (!candidate) return;
    if (!/^[a-z0-9_]{3,20}$/.test(candidate)) return;

    setChecking(true);
    try {
      const res = await fetch(`/api/profile/check-username?username=${encodeURIComponent(candidate)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvailability({ available: false, message: typeof data?.message === "string" ? data.message : "Invalid username" });
        return;
      }
      setAvailability({ available: !!data.available, normalized: data.normalized });
    } catch {
      setAvailability({ available: false, message: "Unable to check username" });
    } finally {
      setChecking(false);
    }
  };

  // Debounced availability checks as the user types.
  useEffect(() => {
    if (!normalizedPreview) return;
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedPreview)) return;

    const t = setTimeout(() => {
      void checkAvailability();
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedPreview]);

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };

    try {
      const result = await withTimeout(submitOnboarding(values), 20_000);
      if (!result.ok) {
        if ("fieldErrors" in result) {
          for (const [key, message] of Object.entries(result.fieldErrors)) {
            form.setError(key as keyof FormValues, { type: "server", message });
          }
          throw new Error("Please fix the highlighted fields");
        }
        throw new Error(result.formError);
      }

      toast.success("Welcome to Verial", { description: "Your profile is set up." });
      setSubmitSuccess(true);

      // Prefer client-side navigation; fall back to a hard redirect if something
      // (middleware/cache) prevents the router transition from taking effect.
      router.replace("/dashboard");
      router.refresh();
      setTimeout(() => {
        if (window.location.pathname !== "/dashboard") {
          window.location.assign("/dashboard");
        }
      }, 500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to complete onboarding";
      console.error("[ONBOARDING_SUBMIT]", err);
      setSubmitError(message);
      toast.error("Onboarding failed", { description: message });
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = async () => {
    const stepFields: Record<number, Array<keyof FormValues>> = {
      1: ["username", "firstName", "lastName", "phone"],
      2: ["addressLine1", "addressLine2", "suburb", "city", "region", "postcode"],
      3: ["acceptTerms", "acceptPrivacy", "confirm18Plus"],
    };
    const ok = await form.trigger(stepFields[step], { shouldFocus: true });
    if (!ok) return;

    if (step === 1 && availability && availability.available === false) {
      form.setError("username", {
        type: "validate",
        message: availability.message || "Username is not available",
      });
      return;
    }

    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  };

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up your account</CardTitle>
        <CardDescription>
          Step {step} of 3 — we need this before you can use the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {submitError && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
                Profile completed. Redirecting you to your dashboard…
              </div>
            )}

            {step === 1 && (
              <>
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
                      <div className="text-sm text-muted-foreground">
                        Preview: <span className="font-medium">@{normalizedPreview || "..."}</span>
                        {checking && (
                          <span className="ml-2 inline-flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" /> checking
                          </span>
                        )}
                      </div>
                      {availability && (
                        <div className={availability.available ? "text-sm text-green-700" : "text-sm text-destructive"}>
                          {availability.available
                            ? "Username is available"
                            : availability.message || "Username is not available"}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              </>
            )}

            {step === 2 && (
              <>
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Region</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
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
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="acceptTerms"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 rounded-md border p-3">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                        </FormControl>
                        <div className="flex-1">
                          <FormLabel className="cursor-pointer">I accept the Terms</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Read them at <a className="underline" href="/legal/terms">/legal/terms</a>
                          </div>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="acceptPrivacy"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 rounded-md border p-3">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                        </FormControl>
                        <div className="flex-1">
                          <FormLabel className="cursor-pointer">I accept the Privacy Policy</FormLabel>
                          <div className="text-sm text-muted-foreground">
                            Read it at <a className="underline" href="/legal/privacy">/legal/privacy</a>
                          </div>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirm18Plus"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-3 rounded-md border p-3">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                        </FormControl>
                        <div className="flex-1">
                          <FormLabel className="cursor-pointer">I confirm I am 18+ years old</FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={goBack} disabled={step === 1 || isSaving}>
                Back
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={goNext} disabled={isSaving}>
                  Next
                </Button>
              ) : (
                <Button type="submit" className="min-w-40" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete onboarding
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

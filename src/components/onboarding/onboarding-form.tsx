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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and dashes"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function OnboardingForm(props: {
  initialFirstName?: string | null;
  initialLastName?: string | null;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availability, setAvailability] = useState<null | { available: boolean; normalized?: string; message?: string }>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      username: "",
      firstName: props.initialFirstName ?? "",
      lastName: props.initialLastName ?? "",
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

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: values.username,
          firstName: values.firstName,
          lastName: values.lastName,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to complete onboarding");
      }

      toast.success("Welcome to Verial", { description: "Your profile is set up." });
      router.replace("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to complete onboarding";
      toast.error("Onboarding failed", { description: message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up your account</CardTitle>
        <CardDescription>Pick a unique username and confirm your name.</CardDescription>
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
                      placeholder="your-username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onBlur={() => {
                        field.onBlur();
                        void checkAvailability();
                      }}
                    />
                  </FormControl>
                  <div className="text-sm text-muted-foreground">
                    Preview: <span className="font-medium">@{normalizedPreview || "..."}</span>
                    {checking && <span className="ml-2 inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> checking</span>}
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

            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

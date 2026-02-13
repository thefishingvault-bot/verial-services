"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { JOB_BUDGET_OPTIONS, JOB_CATEGORIES, JOB_TIMING_OPTIONS } from "@/lib/customer-job-meta";
import { NZ_REGIONS_TO_SUBURBS } from "@/lib/data/nz-suburbs";

type FormErrors = {
  title?: string;
  description?: string;
};

type JobPayload = {
  id: string;
  title: string;
  description: string;
  region: string | null;
  suburb: string | null;
  category: string;
  budget: string;
  timing: string;
  requestedDate: string | null;
};

export default function EditCustomerJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState<keyof typeof NZ_REGIONS_TO_SUBURBS | "">("");
  const [suburb, setSuburb] = useState("");
  const [category, setCategory] = useState<(typeof JOB_CATEGORIES)[number]>("Other");
  const [budget, setBudget] = useState<(typeof JOB_BUDGET_OPTIONS)[number]>("Not sure / Get quotes");
  const [timing, setTiming] = useState<(typeof JOB_TIMING_OPTIONS)[number]>("ASAP");
  const [requestedDate, setRequestedDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const suburbs = useMemo(() => (region ? NZ_REGIONS_TO_SUBURBS[region] ?? [] : []), [region]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const res = await fetch(`/api/customer/job-requests/${params.id}`);
      if (!res.ok) {
        setError(await res.text());
        setLoading(false);
        return;
      }

      const payload = (await res.json()) as { job: JobPayload };
      const job = payload.job;
      setTitle(job.title ?? "");
      setDescription(job.description ?? "");
      setRegion((job.region as keyof typeof NZ_REGIONS_TO_SUBURBS) ?? "");
      setSuburb(job.suburb ?? "");
      setCategory((job.category as (typeof JOB_CATEGORIES)[number]) ?? "Other");
      setBudget((job.budget as (typeof JOB_BUDGET_OPTIONS)[number]) ?? "Not sure / Get quotes");
      setTiming((job.timing as (typeof JOB_TIMING_OPTIONS)[number]) ?? "ASAP");
      setRequestedDate(job.requestedDate ?? "");
      setLoading(false);
    };

    void run();
  }, [params.id]);

  const validate = () => {
    const next: FormErrors = {};
    if (title.trim().length < 5) {
      next.title = "Title must be at least 5 characters.";
    }
    if (description.trim().length < 20) {
      next.description = "Description must be at least 20 characters.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = () => {
    if (!validate()) return;

    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/customer/job-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          region,
          suburb,
          category,
          budget,
          timing,
          requestedDate: timing === "Choose date" ? requestedDate || null : null,
        }),
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      toast({
        title: "Job updated",
        description: "Your changes have been saved.",
      });
      router.push(`/customer/jobs/${params.id}`);
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading job…</p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm">Title</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isPending}
                  placeholder="Need lawn mowed (front + back)"
                />
                {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm">Description</label>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={isPending}
                  rows={5}
                />
                {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description}</p>}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm">Category</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as (typeof JOB_CATEGORIES)[number])}
                    disabled={isPending}
                  >
                    {JOB_CATEGORIES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm">Budget (optional)</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value as (typeof JOB_BUDGET_OPTIONS)[number])}
                    disabled={isPending}
                  >
                    {JOB_BUDGET_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm">Timing (optional)</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={timing}
                    onChange={(event) => setTiming(event.target.value as (typeof JOB_TIMING_OPTIONS)[number])}
                    disabled={isPending}
                  >
                    {JOB_TIMING_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                {timing === "Choose date" && (
                  <div>
                    <label className="mb-1 block text-sm">Preferred date</label>
                    <Input type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} disabled={isPending} />
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm">Region</label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={region}
                    onChange={(event) => {
                      setRegion(event.target.value as keyof typeof NZ_REGIONS_TO_SUBURBS);
                      setSuburb("");
                    }}
                    disabled={isPending}
                  >
                    <option value="">Select region</option>
                    {Object.keys(NZ_REGIONS_TO_SUBURBS).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm">Suburb</label>
                  <Input
                    list="suburb-options"
                    value={suburb}
                    onChange={(event) => setSuburb(event.target.value)}
                    disabled={isPending}
                    placeholder="Start typing suburb"
                  />
                  <datalist id="suburb-options">
                    {suburbs.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="flex gap-2">
                <Button disabled={isPending} onClick={save}>Save changes</Button>
                <Button variant="outline" disabled={isPending} onClick={() => router.push(`/customer/jobs/${params.id}`)}>Cancel</Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { JOB_BUDGET_OPTIONS, JOB_CATEGORIES, JOB_TIMING_OPTIONS } from "@/lib/customer-job-meta";
import { NZ_REGIONS_TO_SUBURBS } from "@/lib/data/nz-suburbs";
import { mapCustomerJobCategoryToProviderCategory } from "@/lib/provider-categories";

type FormErrors = {
  title?: string;
  description?: string;
};

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 4000;

export default function NewCustomerJobPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState<keyof typeof NZ_REGIONS_TO_SUBURBS | "">("");
  const [suburb, setSuburb] = useState("");
  const [category, setCategory] = useState<(typeof JOB_CATEGORIES)[number]>("Other");
  const [budget, setBudget] = useState<(typeof JOB_BUDGET_OPTIONS)[number]>("Not sure / Get quotes");
  const [timing, setTiming] = useState<(typeof JOB_TIMING_OPTIONS)[number]>("ASAP");
  const [requestedDate, setRequestedDate] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const suburbs = region ? NZ_REGIONS_TO_SUBURBS[region] ?? [] : [];

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

  const submit = () => {
    if (!validate()) return;

    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/customer/job-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          region,
          suburb,
          category,
          categoryId: mapCustomerJobCategoryToProviderCategory(category),
          budget,
          timing,
          requestedDate: timing === "Choose date" ? requestedDate || null : null,
          photoUrls,
        }),
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      const created = (await res.json()) as { id: string };
      toast({
        title: "Job posted ✅",
        description: "Your job is now live for providers to quote on.",
      });
      router.push(`/customer/jobs/${created.id}`);
    });
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const incoming = Array.from(files);
    if (photoUrls.length + incoming.length > 8) {
      setError("You can upload up to 8 photos.");
      return;
    }

    setError(null);
    setIsUploadingPhotos(true);

    try {
      const uploaded: string[] = [];
      for (const file of incoming) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error("Only JPG, PNG, and WEBP images are allowed.");
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error("Each photo must be 5MB or smaller.");
        }

        const presignRes = await fetch("/api/uploads/presign-job-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileType: file.type, fileSize: file.size }),
        });

        if (!presignRes.ok) {
          throw new Error(await presignRes.text());
        }

        const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string };
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload photo.");
        }

        uploaded.push(publicUrl);
      }

      setPhotoUrls((prev) => [...prev, ...uploaded].slice(0, 8));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload photos.");
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Post a new job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Title</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              disabled={isPending}
              placeholder="Need lawn mowed (front + back)"
            />
            <p className="mt-1 text-xs text-muted-foreground">{title.length}/{TITLE_MAX}</p>
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm">Description</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={DESCRIPTION_MAX}
              disabled={isPending}
              placeholder="Please include property size, access notes, and your preferred timing."
              rows={5}
            />
            <p className="mt-1 text-xs text-muted-foreground">{description.length}/{DESCRIPTION_MAX}</p>
            {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description}</p>}
            <div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Tip: Include photos, measurements, access notes, and when you need it done.
            </div>
          </div>

          <div className="space-y-2">
            <label className="mb-1 block text-sm">Photos (optional)</label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={isPending || isUploadingPhotos || photoUrls.length >= 8}
                onChange={(event) => {
                  void uploadPhotos(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              {isUploadingPhotos && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground">Upload up to 8 photos. JPG, PNG, or WEBP. Max 5MB each.</p>

            {photoUrls.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {photoUrls.map((url) => (
                  <div key={url} className="relative h-24 overflow-hidden rounded-md border">
                    <Image src={url} alt="Job photo" fill className="object-cover" unoptimized />
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded bg-background/90 p-1"
                      onClick={() => setPhotoUrls((prev) => prev.filter((item) => item !== url))}
                      aria-label="Remove photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

          <p className="text-xs text-muted-foreground">Only suburb is shown publicly until you accept a quote.</p>

          <Button disabled={isPending || isUploadingPhotos} onClick={submit}>
            {isUploadingPhotos ? <Upload className="mr-2 h-4 w-4" /> : null}
            Post job
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

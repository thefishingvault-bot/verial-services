"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Eye, MessageCircle, Send } from "lucide-react";

import type { ProviderFeedJob, ProviderQuoteState } from "./types";
import { JobPhotosGallery } from "@/components/jobs/job-photos-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCanonicalJobStatus } from "@/lib/customer-job-meta";

type ProviderJobFeedCardProps = {
  job: ProviderFeedJob;
  isSaved: boolean;
  onToggleSave: (jobId: string) => void;
};

function formatRelativeTime(isoDate: string) {
  const value = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - value.getTime();
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "Posted just now";
  if (mins < 60) return `Posted ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Posted ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Posted ${days}d ago`;
  return `Posted ${value.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}`;
}

function categoryEmoji(category: string) {
  switch (category) {
    case "Cleaning":
      return "🧹";
    case "Lawn/Garden":
      return "🌿";
    case "Handyman":
      return "🔧";
    case "IT Support":
      return "💻";
    case "Moving":
      return "📦";
    case "Car Detailing":
      return "🚗";
    case "Tutoring":
      return "🎓";
    default:
      return "❓";
  }
}

function quoteBadge(quoteState: ProviderQuoteState) {
  if (quoteState === "accepted") return { label: "Quote accepted", variant: "default" as const };
  if (quoteState === "submitted") return { label: "Quote submitted", variant: "secondary" as const };
  if (quoteState === "rejected") return { label: "Quote rejected", variant: "outline" as const };
  return { label: "No quote yet", variant: "outline" as const };
}

export function ProviderJobFeedCard({ job, isSaved, onToggleSave }: ProviderJobFeedCardProps) {
  const router = useRouter();

  const previewText = useMemo(() => {
    if (!job.description) return "No additional details provided.";
    if (job.description.length <= 260) return job.description;
    return `${job.description.slice(0, 260).trimEnd()}...`;
  }, [job.description]);

  const quote = quoteBadge(job.quoteState);
  const detailHref = `/provider/job-requests/${job.id}`;
  const quoteHref = `/provider/job-requests/${job.id}?tab=quote`;
  const qaHref = `/provider/job-requests/${job.id}?tab=qa`;
  const photoUrls = job.photos.map((photo) => photo.url);

  return (
    <Card
      className="cursor-pointer border shadow-sm transition-colors hover:bg-muted/20"
      onClick={() => router.push(detailHref)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(detailHref);
        }
      }}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="line-clamp-2 text-base font-semibold wrap-anywhere">{job.title}</h3>
            <p className="text-xs text-muted-foreground wrap-anywhere">{job.suburb ?? "-"}, {job.region ?? "-"}</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(job.createdAt)} · {job.category} · {job.budget} · {job.timing}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge>{formatCanonicalJobStatus(job.jobStatus)}</Badge>
            <Badge variant={quote.variant}>{quote.label}</Badge>
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <p className="line-clamp-4 text-foreground/90 wrap-anywhere">{previewText}</p>
          <Link
            href={detailHref}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            Read more
          </Link>
        </div>

        <div onClick={(event) => event.stopPropagation()}>
          <JobPhotosGallery
            photos={photoUrls}
            altPrefix="Job photo"
            maxPreview={1}
            showMoreBadge
            gridClassName="grid-cols-1 md:grid-cols-1"
            tileClassName="aspect-[16/10]"
            onEmpty={
              <div className="flex h-44 items-center justify-center rounded-md border bg-linear-to-br from-muted to-muted/40 p-4 text-center">
                <div className="space-y-2">
                  <div className="text-4xl" aria-hidden>
                    {categoryEmoji(job.category)}
                  </div>
                  <p className="text-sm font-medium">No photos provided</p>
                  <p className="text-xs text-muted-foreground">Tip: Ask a question or request photos in Q&A.</p>
                </div>
              </div>
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3" onClick={(event) => event.stopPropagation()}>
          {job.quoteState === "none" ? (
            <Button asChild>
              <Link href={quoteHref}>
                <Send className="mr-2 h-4 w-4" />
                Send quote
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={quoteHref}>
                <Eye className="mr-2 h-4 w-4" />
                View quote
              </Link>
            </Button>
          )}

          <Button variant="outline" asChild>
            <Link href={detailHref}>View job</Link>
          </Button>

          <Button variant="outline" onClick={() => onToggleSave(job.id)}>
            <Bookmark className="mr-2 h-4 w-4" />
            {isSaved ? "Saved" : "Save"}
          </Button>

          <Button variant="ghost" asChild>
            <Link href={qaHref}>
              <MessageCircle className="mr-2 h-4 w-4" />
              Ask a question
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

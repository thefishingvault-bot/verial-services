"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronLeft, ChevronRight, Eye, MessageCircle, Send } from "lucide-react";

import type { ProviderFeedJob, ProviderQuoteState } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

function PhotoTile({
  url,
  alt,
  onClick,
  overlay,
}: {
  url: string;
  alt: string;
  onClick: () => void;
  overlay?: string;
}) {
  return (
    <button type="button" onClick={onClick} className="group relative h-full w-full overflow-hidden rounded-md border text-left">
      <Image src={url} alt={alt} fill className="object-cover transition-transform group-hover:scale-[1.02]" unoptimized />
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/55 text-lg font-semibold text-foreground">
          {overlay}
        </div>
      ) : null}
    </button>
  );
}

export function ProviderJobFeedCard({ job, isSaved, onToggleSave }: ProviderJobFeedCardProps) {
  const router = useRouter();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const previewText = useMemo(() => {
    if (!job.description) return "No additional details provided.";
    if (job.description.length <= 260) return job.description;
    return `${job.description.slice(0, 260).trimEnd()}...`;
  }, [job.description]);

  const quote = quoteBadge(job.quoteState);
  const detailHref = `/provider/job-requests/${job.id}`;
  const photos = job.photos;
  const moreCount = Math.max(0, photos.length - 4);

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
            <h3 className="line-clamp-2 text-base font-semibold">{job.title}</h3>
            <p className="text-xs text-muted-foreground">{job.suburb ?? "-"}, {job.region ?? "-"}</p>
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
          <p className="line-clamp-4 text-foreground/90">{previewText}</p>
          <Link
            href={detailHref}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            Read more
          </Link>
        </div>

        {photos.length > 0 ? (
          <div
            className={
              photos.length === 1
                ? "relative h-72"
                : photos.length === 2
                  ? "grid h-64 grid-cols-2 gap-2"
                  : photos.length === 3
                    ? "grid h-72 grid-cols-2 grid-rows-2 gap-2"
                    : "grid h-72 grid-cols-2 grid-rows-2 gap-2"
            }
            onClick={(event) => event.stopPropagation()}
          >
            {photos.length === 1 && (
              <PhotoTile
                url={photos[0].url}
                alt="Job photo 1"
                onClick={() => {
                  setPhotoIndex(0);
                  setLightboxOpen(true);
                }}
              />
            )}

            {photos.length === 2 && photos.map((photo, index) => (
              <PhotoTile
                key={photo.url}
                url={photo.url}
                alt={`Job photo ${index + 1}`}
                onClick={() => {
                  setPhotoIndex(index);
                  setLightboxOpen(true);
                }}
              />
            ))}

            {photos.length === 3 && (
              <>
                <div className="row-span-2">
                  <PhotoTile
                    url={photos[0].url}
                    alt="Job photo 1"
                    onClick={() => {
                      setPhotoIndex(0);
                      setLightboxOpen(true);
                    }}
                  />
                </div>
                <PhotoTile
                  url={photos[1].url}
                  alt="Job photo 2"
                  onClick={() => {
                    setPhotoIndex(1);
                    setLightboxOpen(true);
                  }}
                />
                <PhotoTile
                  url={photos[2].url}
                  alt="Job photo 3"
                  onClick={() => {
                    setPhotoIndex(2);
                    setLightboxOpen(true);
                  }}
                />
              </>
            )}

            {photos.length >= 4 && photos.slice(0, 4).map((photo, index) => (
              <PhotoTile
                key={photo.url}
                url={photo.url}
                alt={`Job photo ${index + 1}`}
                overlay={index === 3 && moreCount > 0 ? `+${moreCount}` : undefined}
                onClick={() => {
                  setPhotoIndex(index);
                  setLightboxOpen(true);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-52 items-center justify-center rounded-md border bg-gradient-to-br from-muted to-muted/40 p-4 text-center">
            <div className="space-y-2">
              <div className="text-4xl" aria-hidden>
                {categoryEmoji(job.category)}
              </div>
              <p className="text-sm font-medium">No photos provided</p>
              <p className="text-xs text-muted-foreground">Tip: Ask a question or request photos in Q&A.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3" onClick={(event) => event.stopPropagation()}>
          {job.quoteState === "none" ? (
            <Button asChild>
              <Link href={detailHref}>
                <Send className="mr-2 h-4 w-4" />
                Send quote
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={detailHref}>
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
            <Link href={`${detailHref}#questions`}>
              <MessageCircle className="mr-2 h-4 w-4" />
              Ask a question
            </Link>
          </Button>
        </div>
      </CardContent>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">Job photos</DialogTitle>
          {photos.length > 0 ? (
            <div className="space-y-2">
              <div className="relative h-[70vh] overflow-hidden rounded-md border">
                <Image
                  src={photos[photoIndex]?.url ?? photos[0].url}
                  alt={`Job photo ${photoIndex + 1}`}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              {photos.length > 1 ? (
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">{photoIndex + 1} / {photos.length}</span>
                  <Button
                    variant="outline"
                    onClick={() => setPhotoIndex((prev) => (prev + 1) % photos.length)}
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type JobPhotosGalleryProps = {
  photos: string[];
  altPrefix?: string;
  maxPreview?: number;
  showMoreBadge?: boolean;
  gridClassName?: string;
  tileClassName?: string;
  onEmpty?: React.ReactNode;
};

export function JobPhotosGallery({
  photos,
  altPrefix = "Job photo",
  maxPreview,
  showMoreBadge = false,
  gridClassName,
  tileClassName,
  onEmpty,
}: JobPhotosGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const allPhotos = useMemo(() => photos.filter((url) => typeof url === "string" && url.trim().length > 0), [photos]);
  const visiblePhotos = useMemo(
    () => (typeof maxPreview === "number" && maxPreview > 0 ? allPhotos.slice(0, maxPreview) : allPhotos),
    [allPhotos, maxPreview],
  );

  if (allPhotos.length === 0) {
    return onEmpty ? <>{onEmpty}</> : null;
  }

  const hiddenCount = Math.max(0, allPhotos.length - visiblePhotos.length);

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", gridClassName)}>
        {visiblePhotos.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => {
              setPhotoIndex(index);
              setLightboxOpen(true);
            }}
            className={cn(
              "group relative w-full overflow-hidden rounded-md border bg-muted/30 text-left",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "ring-offset-background",
              "aspect-4/3",
              tileClassName,
            )}
          >
            <Image
              src={url}
              alt={`${altPrefix} ${index + 1}`}
              fill
              className="object-contain p-1"
              unoptimized
            />
            {showMoreBadge && index === visiblePhotos.length - 1 && hiddenCount > 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-lg font-semibold text-foreground">
                +{hiddenCount}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">Job photos</DialogTitle>
          <div className="space-y-2">
            <div className="relative h-[70vh] overflow-hidden rounded-md border bg-muted/30">
              <Image
                src={allPhotos[photoIndex] ?? allPhotos[0]}
                alt={`${altPrefix} ${photoIndex + 1}`}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            {allPhotos.length > 1 ? (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length)}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">{photoIndex + 1} / {allPhotos.length}</span>
                <Button variant="outline" onClick={() => setPhotoIndex((prev) => (prev + 1) % allPhotos.length)}>
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

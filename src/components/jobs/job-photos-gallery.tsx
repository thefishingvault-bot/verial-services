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
  variant?: "detail" | "compact";
  maxPreview?: number;
  showMoreBadge?: boolean;
  gridClassName?: string;
  tileClassName?: string;
  renderTileOverlay?: (args: { index: number; url: string }) => React.ReactNode;
  onEmpty?: React.ReactNode;
};

export function JobPhotosGallery({
  photos,
  altPrefix = "Job photo",
  variant = "detail",
  maxPreview,
  showMoreBadge = false,
  gridClassName,
  tileClassName,
  renderTileOverlay,
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

  const openLightbox = (index: number) => {
    setPhotoIndex(index);
    setLightboxOpen(true);
  };

  const renderBaseTile = (url: string, index: number, className?: string, moreLabel?: string) => (
    <button
      key={`${url}-${index}`}
      type="button"
      onClick={() => openLightbox(index)}
      className={cn(
        "group relative w-full overflow-hidden rounded-md border bg-muted/30 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "ring-offset-background",
        className,
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
      {moreLabel ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-lg font-semibold text-foreground">
          {moreLabel}
        </div>
      ) : null}
      {renderTileOverlay ? (
        <div className="absolute right-1 top-1 z-10" onClick={(event) => event.stopPropagation()}>
          {renderTileOverlay({ index, url })}
        </div>
      ) : null}
    </button>
  );

  const renderCompactGrid = () => (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", gridClassName)}>
      {visiblePhotos.map((url, index) => {
        const showCompactMore = showMoreBadge && index === visiblePhotos.length - 1 && hiddenCount > 0;
        return renderBaseTile(url, index, "aspect-video", showCompactMore ? `+${hiddenCount}` : undefined);
      })}
    </div>
  );

  const renderDetailGrid = () => {
    const count = allPhotos.length;

    if (count === 1) {
      return (
        <div className={cn("grid grid-cols-1 gap-2", gridClassName)}>
          {renderBaseTile(allPhotos[0], 0, "aspect-video")}
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className={cn("grid grid-cols-2 gap-2", gridClassName)}>
          {allPhotos.slice(0, 2).map((url, index) => renderBaseTile(url, index, "aspect-square"))}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div className={cn("grid grid-cols-2 grid-rows-2 gap-2", gridClassName)}>
          {renderBaseTile(allPhotos[0], 0, "row-span-2 aspect-auto h-full min-h-40")}
          {renderBaseTile(allPhotos[1], 1, "aspect-auto h-full min-h-[7.5rem]")}
          {renderBaseTile(allPhotos[2], 2, "aspect-auto h-full min-h-[7.5rem]")}
        </div>
      );
    }

    if (count === 4) {
      return (
        <div className={cn("grid grid-cols-2 grid-rows-2 gap-2", gridClassName)}>
          {allPhotos.slice(0, 4).map((url, index) => renderBaseTile(url, index, "aspect-square"))}
        </div>
      );
    }

    return (
      <div className={cn("grid grid-cols-6 grid-rows-2 gap-2", gridClassName)}>
        {renderBaseTile(allPhotos[0], 0, "col-span-3 aspect-auto h-full min-h-[8.5rem]")}
        {renderBaseTile(allPhotos[1], 1, "col-span-3 aspect-auto h-full min-h-[8.5rem]")}
        {renderBaseTile(allPhotos[2], 2, "col-span-2 aspect-auto h-full min-h-[8.5rem]")}
        {renderBaseTile(allPhotos[3], 3, "col-span-2 aspect-auto h-full min-h-[8.5rem]")}
        {renderBaseTile(allPhotos[4], 4, "col-span-2 aspect-auto h-full min-h-[8.5rem]", `+${count - 5}`)}
      </div>
    );
  };

  return (
    <>
      {variant === "compact" ? renderCompactGrid() : renderDetailGrid()}

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

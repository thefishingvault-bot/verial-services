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

  const renderBaseTile = (
    url: string,
    index: number,
    options?: {
      className?: string;
      moreLabel?: string;
      fit?: "contain" | "cover";
      imageClassName?: string;
      badgeStyle?: "full" | "corner";
    },
  ) => (
    <button
      key={`${url}-${index}`}
      type="button"
      onClick={() => openLightbox(index)}
      className={cn(
        "group relative w-full overflow-hidden rounded-md border bg-muted/30 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "ring-offset-background",
        options?.className,
        tileClassName,
      )}
    >
      <Image
        src={url}
        alt={`${altPrefix} ${index + 1}`}
        fill
        className={cn(
          options?.fit === "cover" ? "object-cover" : "object-contain",
          options?.fit === "cover" ? "p-0" : "p-1",
          options?.imageClassName,
        )}
        unoptimized
      />
      {options?.moreLabel
        ? (options.badgeStyle ?? "full") === "corner"
          ? (
              <>
                <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-28 bg-linear-to-tl from-black/70 to-transparent" />
                <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                  {options.moreLabel}
                </div>
              </>
            )
          : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-lg font-semibold text-white">
                {options.moreLabel}
              </div>
            )
        : null}
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
        return renderBaseTile(url, index, {
          className: "aspect-video",
          fit: "cover",
          moreLabel: showCompactMore ? `+${hiddenCount}` : undefined,
          badgeStyle: "corner",
        });
      })}
    </div>
  );

  const renderDetailGrid = () => {
    const count = allPhotos.length;

    if (count === 1) {
      return (
        <div className={cn("grid grid-cols-1 gap-2", gridClassName)}>
          {renderBaseTile(allPhotos[0], 0, { className: "aspect-video", fit: "contain" })}
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className={cn("grid grid-cols-2 gap-2", gridClassName)}>
          {allPhotos.slice(0, 2).map((url, index) => renderBaseTile(url, index, { className: "aspect-square", fit: "cover" }))}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div className={cn("grid grid-cols-2 grid-rows-2 gap-2", gridClassName)}>
          {renderBaseTile(allPhotos[0], 0, { className: "row-span-2 aspect-auto h-full min-h-40", fit: "cover" })}
          {renderBaseTile(allPhotos[1], 1, { className: "aspect-auto h-full min-h-[7.5rem]", fit: "cover" })}
          {renderBaseTile(allPhotos[2], 2, { className: "aspect-auto h-full min-h-[7.5rem]", fit: "cover" })}
        </div>
      );
    }

    if (count === 4) {
      return (
        <div className={cn("grid grid-cols-2 grid-rows-2 gap-2", gridClassName)}>
          {allPhotos.slice(0, 4).map((url, index) => renderBaseTile(url, index, { className: "aspect-square", fit: "cover" }))}
        </div>
      );
    }

    return (
      <div className={cn("grid grid-cols-6 grid-rows-2 gap-2", gridClassName)}>
        {renderBaseTile(allPhotos[0], 0, { className: "col-span-3 aspect-auto h-full min-h-[8.5rem]", fit: "cover" })}
        {renderBaseTile(allPhotos[1], 1, { className: "col-span-3 aspect-auto h-full min-h-[8.5rem]", fit: "cover" })}
        {renderBaseTile(allPhotos[2], 2, { className: "col-span-2 aspect-auto h-full min-h-[8.5rem]", fit: "cover" })}
        {renderBaseTile(allPhotos[3], 3, { className: "col-span-2 aspect-auto h-full min-h-[8.5rem]", fit: "cover" })}
        {renderBaseTile(allPhotos[4], 4, {
          className: "col-span-2 aspect-auto h-full min-h-[8.5rem]",
          fit: "cover",
          moreLabel: `+${count - 5}`,
          badgeStyle: "corner",
        })}
      </div>
    );
  };

  return (
    <>
      {variant === "compact" ? renderCompactGrid() : renderDetailGrid()}

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-h-[90vh] border-black/40 bg-black/95 p-2 text-white sm:max-w-[90vw]">
          <DialogTitle className="sr-only">Job photos</DialogTitle>
          <div className="space-y-3">
            <div className="relative flex h-[80vh] items-center justify-center overflow-hidden rounded-md bg-black/90">
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
                  className="border-white/25 bg-black/60 text-white hover:bg-black/80"
                  onClick={() => setPhotoIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length)}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <span className="text-xs text-white/80">{photoIndex + 1} / {allPhotos.length}</span>
                <Button
                  variant="outline"
                  className="border-white/25 bg-black/60 text-white hover:bg-black/80"
                  onClick={() => setPhotoIndex((prev) => (prev + 1) % allPhotos.length)}
                >
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

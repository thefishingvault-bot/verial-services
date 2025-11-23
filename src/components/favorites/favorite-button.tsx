"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/nextjs";

interface FavoriteButtonProps {
  providerId: string;
  initialIsFavorite: boolean;
}

export function FavoriteButton({ providerId, initialIsFavorite }: FavoriteButtonProps) {
  const { isSignedIn } = useUser();
  const pathname = usePathname();

  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (!isSignedIn) {
      const redirectUrl = `${window.location.origin}${pathname}`;
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`;
      return;
    }

    setError(null);
    const nextIsFavorite = !isFavorite;
    const previousIsFavorite = isFavorite;
    setIsFavorite(nextIsFavorite);

    const action = nextIsFavorite ? "favorite" : "unfavorite";

    startTransition(async () => {
      try {
        const res = await fetch("/api/favorites/providers/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, action }),
        });

        if (!res.ok) {
          throw new Error("Failed to update favorites");
        }

        const data = (await res.json()) as { success: boolean; isFavorite: boolean };
        if (!data.success) {
          throw new Error("Failed to update favorites");
        }

        setIsFavorite(data.isFavorite);
      } catch (err) {
        console.warn("[FAVORITE_TOGGLE_ERROR]", err);
        setIsFavorite(previousIsFavorite);
        setError("Could not update favourites. Please try again.");
      }
    });
  };

  const label = isFavorite ? "Unsave provider" : "Save provider";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={isFavorite ? "default" : "outline"}
        size="icon"
        aria-pressed={isFavorite}
        aria-label={label}
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full h-9 w-9"
      >
        <Heart
          className={`h-4 w-4 transition-colors ${
            isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground"
          }`}
        />
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

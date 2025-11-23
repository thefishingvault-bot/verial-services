"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";

type FavoriteButtonProps = {
  providerId: string;
  initialIsFavorite: boolean;
};

export function FavoriteButton({
  providerId,
  initialIsFavorite,
}: FavoriteButtonProps) {
  const { isSignedIn } = useUser();
  const pathname = usePathname();

  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    // Not signed in → send to sign-in, come back here after
    if (!isSignedIn) {
      if (typeof window !== "undefined") {
        const redirectUrl = `${window.location.origin}${pathname}`;
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(
          redirectUrl,
        )}`;
      }
      return;
    }

    startTransition(async () => {
      setError(null);

      const next = !isFavorite;
      setIsFavorite(next);

      const action = next ? "favorite" : "unfavorite";

      try {
        const res = await fetch("/api/favorites/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, action }),
        });

        if (!res.ok) {
          throw new Error("Request failed");
        }

        const data = (await res.json()) as { isFavorite?: boolean };

        if (typeof data.isFavorite === "boolean") {
          setIsFavorite(data.isFavorite);
        }
      } catch (err) {
        console.error("[FAVORITE_TOGGLE_ERROR]", err);
        // revert optimistic update
        setIsFavorite(!next);
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
        disabled={isPending}
        onClick={handleClick}
        className="h-9 w-9 rounded-full"
      >
        <Heart
          className={`h-4 w-4 transition-colors ${
            isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground"
          }`}
        />
      </Button>

      {error && (
        <p className="max-w-[180px] text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

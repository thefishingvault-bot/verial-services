"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteToggleProps {
  serviceId: string;
  initialIsFavorite: boolean;
  onToggleOptimistic?: (next: boolean) => void;
  onError?: () => void;
}

export function FavoriteToggle({ serviceId, initialIsFavorite, onToggleOptimistic, onError }: FavoriteToggleProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  const toggleFavorite = () => {
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=/services");
      return;
    }

    startTransition(async () => {
      const next = !isFavorite;
      setIsFavorite(next);
      onToggleOptimistic?.(next);

      try {
        if (next) {
          await fetch("/api/services/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serviceId }),
          });
        } else {
          await fetch(`/api/services/favorites?serviceId=${serviceId}`, {
            method: "DELETE",
          });
        }
      } catch (error) {
        setIsFavorite(!next);
        onError?.();
        console.error("Failed to toggle favorite", error);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggleFavorite}
      disabled={isPending}
      className={cn(
        "absolute right-3 top-3 rounded-full border bg-white/90 p-2 shadow-sm transition",
        isFavorite && "border-transparent bg-red-50",
      )}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={cn(
          "h-4 w-4",
          isFavorite ? "fill-red-500 text-red-500" : "text-slate-500",
        )}
      />
    </button>
  );
}

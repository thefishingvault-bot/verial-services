"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteToggleProps {
  serviceId: string;
  initialIsFavorite: boolean;
  initialCount?: number;
  showCount?: boolean;
  onToggleOptimistic?: (next: boolean) => void;
  onError?: () => void;
  onSettled?: (result: { isFavorited: boolean; count: number; error?: boolean }) => void;
}

export function FavoriteToggle({ serviceId, initialIsFavorite, initialCount = 0, showCount = false, onToggleOptimistic, onError, onSettled }: FavoriteToggleProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const toggleFavorite = () => {
    if (!isSignedIn) {
      const redirectUrl = pathname ? `${pathname}` : "/services";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    startTransition(async () => {
      const next = !isFavorite;
      setIsFavorite(next);
      setCount((prev) => Math.max(0, prev + (next ? 1 : -1)));
      onToggleOptimistic?.(next);

      try {
        const res = await fetch("/api/favorites/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId }),
        });

        if (!res.ok) {
          throw new Error(`Toggle failed with status ${res.status}`);
        }

        const data = (await res.json()) as { isFavorited?: boolean; count?: number };
        const finalIsFavorited = typeof data.isFavorited === "boolean" ? data.isFavorited : next;
        const finalCount = typeof data.count === "number" ? Math.max(0, data.count) : count;
        setIsFavorite(finalIsFavorited);
        setCount(finalCount);
        onSettled?.({ isFavorited: finalIsFavorited, count: finalCount });
      } catch (error) {
        setIsFavorite(!next);
        setCount((prev) => Math.max(0, prev + (next ? -1 : 1)));
        onError?.();
        onSettled?.({ isFavorited: !next, count: Math.max(0, count + (next ? -1 : 1)), error: true });
        console.error("Failed to toggle favorite", error);
      }
    });
  };

  return (
    <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={isPending}
        aria-busy={isPending}
        className={cn(
          "rounded-full border bg-white/90 p-2 shadow-sm transition",
          isFavorite && "border-transparent bg-red-50",
          isPending && "opacity-80",
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
      {showCount && (
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs text-slate-600 shadow-sm">
          {count}
        </span>
      )}
    </div>
  );
}

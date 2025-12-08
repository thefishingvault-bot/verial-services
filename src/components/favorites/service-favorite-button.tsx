"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  serviceId: string;
  initialIsFavorite: boolean;
  initialCount: number;
};

export function ServiceFavoriteButton({ serviceId, initialIsFavorite, initialCount }: Props) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => setIsFavorite(initialIsFavorite), [initialIsFavorite]);
  useEffect(() => setCount(initialCount), [initialCount]);

  const toggle = () => {
    if (!isSignedIn) {
      const redirectUrl = pathname ? pathname : "/services";
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    startTransition(async () => {
      const next = !isFavorite;
      setIsFavorite(next);
      setCount((prev) => Math.max(0, prev + (next ? 1 : -1)));

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
        if (typeof data.isFavorited === "boolean") setIsFavorite(data.isFavorited);
        if (typeof data.count === "number") setCount(Math.max(0, data.count));
      } catch (error) {
        setIsFavorite(!next);
        setCount((prev) => Math.max(0, prev + (next ? -1 : 1)));
        console.error("Failed to toggle favorite", error);
      }
    });
  };

  const label = isFavorite ? "Remove from favorites" : "Add to favorites";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={isFavorite ? "default" : "outline"}
        size="sm"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={isFavorite}
        aria-busy={isPending}
        aria-label={label}
        className={cn(
          "gap-2",
          isFavorite ? "bg-red-500 text-white hover:bg-red-600" : "",
          isPending ? "opacity-80" : "",
        )}
      >
        <Heart className={cn("h-4 w-4", isFavorite ? "fill-current" : "text-muted-foreground")}/>
        <span>{isFavorite ? "Saved" : "Save"}</span>
      </Button>
      <span className="text-sm text-slate-600">{count}</span>
    </div>
  );
}

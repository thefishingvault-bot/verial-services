import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

interface FavoriteProvider {
  providerId: string;
  handle: string | null;
  businessName: string | null;
  isVerified: boolean;
  trustLevel: "bronze" | "silver" | "gold" | "platinum" | null;
  baseRegion: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
}

async function fetchFavorites(): Promise<FavoriteProvider[]> {
  try {
    const res = await fetch("/api/favorites/providers", {
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as { favorites: FavoriteProvider[] };
    return data.favorites ?? [];
  } catch {
    return [];
  }
}

export default async function FavoritesPage() {
  const favorites = await fetchFavorites();
  const hasFavorites = favorites.length > 0;

  return (
    <div className="container max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Favourite providers</h1>
        <p className="text-muted-foreground">
          Quick access to providers you&apos;ve saved.
        </p>
      </div>

      {!hasFavorites ? (
        <Card>
          <CardHeader>
            <CardTitle>Favourite providers</CardTitle>
            <CardDescription>Quick access to providers you&apos;ve saved.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>You haven&apos;t saved any providers yet.</p>
              <p>Tap the heart on a provider or service to save it here.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your favourite providers</CardTitle>
            <CardDescription>
              These are the providers you&apos;ve saved. Tap a provider to view their profile and book
              again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {favorites.map((fav) => {
                const primary = fav.businessName || fav.displayName || "Unnamed provider";
                const handle = fav.handle ? `@${fav.handle}` : null;

                const initials = primary
                  .split(" ")
                  .map((part) => part.charAt(0).toUpperCase())
                  .slice(0, 2)
                  .join("");

                return (
                  <Link
                    key={fav.providerId}
                    href={fav.handle ? `/p/${fav.handle}` : "#"}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-muted transition-colors"
                  >
                    <Avatar className="h-9 w-9">
                      {fav.avatarUrl ? (
                        <AvatarImage src={fav.avatarUrl} alt={primary} />
                      ) : (
                        <AvatarFallback>{initials || "?"}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{primary}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {handle}
                        {fav.baseRegion ? (handle ? `  •  ${fav.baseRegion}` : fav.baseRegion) : null}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

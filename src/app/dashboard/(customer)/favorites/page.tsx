import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import { getUserFavoriteServices, type FavoriteSort } from "@/lib/favorites";

type PageProps = {
  searchParams: Promise<{ sort?: string }>;
};

export default async function FavoritesPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/dashboard/favorites");

  const { sort: sortRaw } = await searchParams;
  const sortParam = sortRaw?.toLowerCase();
  const sort: FavoriteSort = sortParam === "top" ? "top" : "recent";

  const favorites = await getUserFavoriteServices(userId, sort);
  const hasFavorites = favorites.length > 0;
  const totalFavorites = favorites.length;
  const sortLabel = sort === "top" ? "Top performers" : "Recently saved";

  return (
    <div className="w-full">
      <section className="space-y-6">
        <div className="rounded-2xl border bg-gradient-to-r from-emerald-50 via-white to-white shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex flex-col gap-4 p-4 md:p-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Favorites</Badge>
                <span className="text-emerald-800">Curated just for you</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold">Saved services</h1>
                <p className="text-muted-foreground text-sm">Quickly return to providers you trust or book again.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <Badge variant="secondary" className="bg-white text-slate-900 shadow-sm">
                  {totalFavorites} saved
                </Badge>
                <span className="text-slate-500">{sortLabel}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Sort</span>
                <div className="flex rounded-full border bg-white/80 shadow-sm overflow-hidden">
                  <Link
                    href="/dashboard/favorites?sort=recent"
                    className={cn(
                      "px-3 py-1.5 text-sm transition hover:bg-slate-50",
                      sort === "recent"
                        ? "bg-slate-900 text-white"
                        : "text-slate-700",
                    )}
                    aria-current={sort === "recent" ? "page" : undefined}
                  >
                    Recent
                  </Link>
                  <Link
                    href="/dashboard/favorites?sort=top"
                    className={cn(
                      "px-3 py-1.5 text-sm transition hover:bg-slate-50 border-l",
                      sort === "top"
                        ? "bg-slate-900 text-white"
                        : "text-slate-700",
                    )}
                    aria-current={sort === "top" ? "page" : undefined}
                  >
                    Top
                  </Link>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/services">Discover more services</Link>
              </Button>
            </div>
          </div>
        </div>

        {!hasFavorites ? (
          <Card className="bg-white border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">❤️ Start saving your favourite services</CardTitle>
              <CardDescription>Tap the heart on any service to keep it close for later.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Browse popular categories and add the ones you like.</p>
              <Button asChild>
                <Link href="/services">Browse services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <FavoritesGrid items={favorites} sort={sort} />
        )}
      </section>
    </div>
  );
}

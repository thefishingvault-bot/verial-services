import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FavoritesGrid } from "@/components/favorites/favorites-grid";
import { getUserFavoriteServices, type FavoriteSort } from "@/lib/favorites";

type PageProps = {
  searchParams?: { sort?: string };
};

export default async function FavoritesPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/dashboard/favorites");

  const sortParam = searchParams?.sort?.toLowerCase();
  const sort: FavoriteSort = sortParam === "top" ? "top" : "recent";

  const favorites = await getUserFavoriteServices(userId, sort);
  const hasFavorites = favorites.length > 0;

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div className="sticky top-16 z-10 bg-gradient-to-b from-white via-white to-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-slate-200 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Saved services</h1>
            <p className="text-muted-foreground text-sm">Services you saved for quick access.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">Sort by</span>
            <div className="flex rounded-md border bg-white shadow-sm overflow-hidden">
              <Link
                href="/dashboard/favorites?sort=recent"
                className={`px-3 py-1 ${sort === "recent" ? "bg-slate-900 text-white" : "text-slate-700"}`}
              >
                Recent
              </Link>
              <Link
                href="/dashboard/favorites?sort=top"
                className={`px-3 py-1 border-l ${sort === "top" ? "bg-slate-900 text-white" : "text-slate-700"}`}
              >
                Top
              </Link>
            </div>
          </div>
        </div>
      </div>

      {!hasFavorites ? (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">❤️ Start saving your favourite services</CardTitle>
            <CardDescription>When you find services you like, tap the heart icon to save them here.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Browse services to get started.</p>
            <Button asChild>
              <Link href="/services">Browse Services</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <FavoritesGrid items={favorites} sort={sort} />
      )}
    </div>
  );
}

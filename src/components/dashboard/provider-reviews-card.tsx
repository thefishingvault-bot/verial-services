"use server";

import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NZ", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export async function ProviderReviewsCard() {
  const { userId } = await auth();
  if (!userId) return null;

  const provider = await db.query.providers.findFirst({
    where: (p, { eq }) => eq(p.userId, userId),
    columns: { id: true },
  });

  if (!provider) return null;

  const reviews = await db.query.reviews.findMany({
    where: (r, { eq }) => eq(r.providerId, provider.id),
    orderBy: (r, { desc }) => desc(r.createdAt),
    limit: 10,
    columns: { id: true, rating: true, comment: true, createdAt: true },
    with: {
      user: {
        columns: { firstName: true, lastName: true },
      },
    },
  });

  if (reviews.length === 0) {
    return (
      <Card className="hover:shadow-lg transition-shadow h-full">
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <CardDescription>
            Once customers leave reviews, they will show up here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No reviews yet. Encourage customers to leave feedback after you complete jobs.
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = reviews.length;
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / total;

  const latestThree = reviews.slice(0, 3);

  return (
    <Card className="hover:shadow-lg transition-shadow h-full">
      <CardHeader>
        <CardTitle>Reviews</CardTitle>
        <CardDescription>How customers rate your work.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-2xl font-semibold">
              {avgRating.toFixed(1)}
              <span className="ml-1 text-base text-muted-foreground">/ 5</span>
            </span>
            <span className="text-xs text-muted-foreground">Based on {total} review{total === 1 ? "" : "s"}</span>
          </div>
          <div className="text-lg font-semibold text-yellow-500" aria-hidden>
            {formatStars(Math.round(avgRating))}
          </div>
        </div>

        <div className="space-y-3">
          {latestThree.map((review) => {
            const name = [review.user?.firstName, review.user?.lastName]
              .filter(Boolean)
              .join(" ") || "Customer";
            const snippet = review.comment?.trim() || "No written comment.";

            return (
              <div
                key={review.id}
                className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium line-clamp-1">{name}</span>
                  <span className="text-yellow-500 font-semibold" aria-hidden>
                    {formatStars(review.rating)}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-2">{snippet}</p>
                <span className="block text-[10px] text-muted-foreground">
                  {review.createdAt ? formatDate(review.createdAt) : ""}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

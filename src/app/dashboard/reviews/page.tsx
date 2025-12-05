import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { reviews, services, providers } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/dashboard");

  const items = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      isHidden: reviews.isHidden,
      hiddenReason: reviews.hiddenReason,
      provider: {
        id: providers.id,
        businessName: providers.businessName,
      },
      service: {
        id: services.id,
        title: services.title,
        slug: services.slug,
      },
    })
    .from(reviews)
    .leftJoin(providers, eq(providers.id, reviews.providerId))
    .leftJoin(services, eq(services.id, reviews.serviceId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.createdAt));

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your Reviews</h1>
        <p className="text-muted-foreground">Track feedback you have left for providers.</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No reviews yet</CardTitle>
            <CardDescription>
              After you complete bookings, you can leave reviews and they will show up here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{item.service?.title ?? "Service"}</CardTitle>
                  <CardDescription>
                    {item.provider?.businessName ?? "Provider"} · {new Date(item.createdAt).toLocaleDateString()}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{item.rating} ★</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {item.comment ? <p>{item.comment}</p> : <p>No written comment.</p>}
                {item.isHidden && (
                  <p className="text-xs text-amber-600">Hidden by admin: {item.hiddenReason ?? "No reason provided."}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

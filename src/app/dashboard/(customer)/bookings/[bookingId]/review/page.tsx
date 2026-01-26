import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bookings, services, providers, reviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReviewForm } from "@/components/reviews/review-form";
import { asOne } from "@/lib/relations/normalize";

export const dynamic = "force-dynamic";

export default async function BookingReviewPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/dashboard");

  const { bookingId } = await params;

  const booking = await db.query.bookings.findFirst({
    where: (b, { and, eq }) => and(eq(b.id, bookingId), eq(b.userId, userId)),
    columns: { id: true, status: true, providerId: true },
    with: {
      service: { columns: { title: true } },
      provider: { columns: { businessName: true } },
    },
  });

  if (!booking) redirect("/dashboard/bookings");

  const existingReview = await db.query.reviews.findFirst({
    where: (r, { and, eq }) => and(eq(r.bookingId, booking.id), eq(r.userId, userId)),
    columns: { id: true },
  });

  if (existingReview) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Review already submitted</CardTitle>
            <CardDescription>
              You have already reviewed this booking.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (booking.status !== "completed" && booking.status !== "completed_by_provider") {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Review not available yet</CardTitle>
            <CardDescription>
              You can only review after the booking is completed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const service = asOne(booking.service);
  const provider = asOne(booking.provider);

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Leave a review</CardTitle>
          <CardDescription>
            Share your experience for {service?.title ?? "this service"} by {provider?.businessName ?? "the provider"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewForm
            bookingId={booking.id}
            serviceTitle={service?.title ?? "Service"}
            onReviewSubmit={() => redirect("/dashboard/bookings")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bookings, services, providers, reviews } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReviewForm } from "@/components/reviews/review-form";

export const dynamic = "force-dynamic";

export default async function BookingReviewPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/dashboard");

  const { bookingId } = await params;

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
    columns: { id: true, status: true, providerId: true },
    with: {
      service: { columns: { title: true } },
      provider: { columns: { businessName: true } },
    },
  });

  if (!booking) redirect("/dashboard/bookings");

  const existingReview = await db.query.reviews.findFirst({
    where: eq(reviews.bookingId, booking.id),
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

  if (booking.status !== "completed") {
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

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Leave a review</CardTitle>
          <CardDescription>
            Share your experience for {booking.service?.title ?? "this service"} by {booking.provider?.businessName ?? "the provider"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewForm
            bookingId={booking.id}
            serviceTitle={booking.service?.title ?? "Service"}
            providerId={booking.providerId}
            onReviewSubmit={() => redirect("/dashboard/bookings")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

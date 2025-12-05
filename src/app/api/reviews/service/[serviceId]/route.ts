import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users, bookings } from "@/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  if (!serviceId) {
    return new NextResponse("serviceId is required", { status: 400 });
  }

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 10);
  const offset = Math.max(0, (page - 1) * pageSize);

  const baseWhere = and(
    eq(reviews.isHidden, false),
    or(eq(reviews.serviceId, serviceId), eq(bookings.serviceId, serviceId))
  );

  const [items, [stats]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(reviews)
      .leftJoin(users, eq(users.id, reviews.userId))
      .leftJoin(bookings, eq(bookings.id, reviews.bookingId))
      .where(baseWhere)
      .orderBy(desc(reviews.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)`,
        avgRating: sql<number>`avg(${reviews.rating})`,
      })
      .from(reviews)
      .leftJoin(bookings, eq(bookings.id, reviews.bookingId))
      .where(baseWhere),
  ]);

  return NextResponse.json({
    items,
    total: Number(stats?.count ?? 0),
    avgRating: Number(stats?.avgRating ?? 0),
    page,
    pageSize,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users, bookings } from "@/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { parseQuery, ReviewsListQuerySchema, ServiceIdSchema } from "@/lib/validation/reviews";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;

  const paramResult = ServiceIdSchema.safeParse({ serviceId });
  if (!paramResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: paramResult.error.flatten() },
      { status: 400 }
    );
  }

  const queryResult = parseQuery(ReviewsListQuerySchema, req);
  if (!queryResult.ok) {
    return NextResponse.json(
      { error: "Invalid request", details: queryResult.error },
      { status: 400 }
    );
  }

  const { page, pageSize } = queryResult.data;
  const offset = Math.max(0, (page - 1) * pageSize);

  const baseWhere = and(
    eq(reviews.isHidden, false),
    or(eq(reviews.serviceId, paramResult.data.serviceId), eq(bookings.serviceId, paramResult.data.serviceId))
  );

  const [items, [stats], breakdownRows] = await Promise.all([
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
    db
      .select({ rating: reviews.rating, count: sql<number>`COUNT(*)` })
      .from(reviews)
      .leftJoin(bookings, eq(bookings.id, reviews.bookingId))
      .where(baseWhere)
      .groupBy(reviews.rating),
  ]);

  const breakdown: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  breakdownRows.forEach((row) => {
    const key = String(row.rating ?? "");
    if (breakdown[key] !== undefined) {
      breakdown[key] = Number(row.count ?? 0);
    }
  });

  return NextResponse.json({
    items,
    total: Number(stats?.count ?? 0),
    avgRating: Number(stats?.avgRating ?? 0),
    page,
    pageSize,
    breakdown,
  });
}

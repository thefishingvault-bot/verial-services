import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { parseQuery, ProviderIdSchema, ReviewsListQuerySchema } from "@/lib/validation/reviews";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;

  const paramResult = ProviderIdSchema.safeParse({ providerId });
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

  const baseWhere = and(eq(reviews.providerId, paramResult.data.providerId), eq(reviews.isHidden, false));

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

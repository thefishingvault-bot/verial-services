import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reviews, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  if (!providerId) {
    return new NextResponse("providerId is required", { status: 400 });
  }

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 10);
  const offset = Math.max(0, (page - 1) * pageSize);

  const baseWhere = and(eq(reviews.providerId, providerId), eq(reviews.isHidden, false));

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

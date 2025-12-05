import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reviews, providers, services, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  await requireAdmin(userId);

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
  const offset = Math.max(0, (page - 1) * pageSize);

  const [items, [counts]] = await Promise.all([
    db
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
        },
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          id: users.id,
        },
      })
      .from(reviews)
      .leftJoin(providers, eq(providers.id, reviews.providerId))
      .leftJoin(services, eq(services.id, reviews.serviceId))
      .leftJoin(users, eq(users.id, reviews.userId))
      .orderBy(desc(reviews.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({
        total: sql<number>`count(*)`,
        hidden: sql<number>`count(*) filter (where ${reviews.isHidden} = true)`,
      })
      .from(reviews),
  ]);

  return NextResponse.json({
    items,
    total: Number(counts?.total ?? 0),
    hidden: Number(counts?.hidden ?? 0),
    page,
    pageSize,
  });
}

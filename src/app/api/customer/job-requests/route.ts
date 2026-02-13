import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { jobRequests, users } from "@/db/schema";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } });
  if (!user) return new NextResponse("User not found", { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
    region?: string;
    suburb?: string;
  } | null;

  const title = body?.title?.trim() ?? "";
  if (!title || title.length > 255) return new NextResponse("Invalid title", { status: 400 });

  const [created] = await db
    .insert(jobRequests)
    .values({
      customerUserId: userId,
      title,
      description: body?.description?.trim() || null,
      region: body?.region?.trim() || null,
      suburb: body?.suburb?.trim() || null,
      status: "open",
      paymentStatus: "pending",
      lifecycleUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const rows = await db.query.jobRequests.findMany({
    where: eq(jobRequests.customerUserId, userId),
    columns: {
      id: true,
      title: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      totalPrice: true,
      depositAmount: true,
      remainingAmount: true,
    },
    orderBy: [desc(jobRequests.createdAt)],
  });

  return NextResponse.json(rows);
}

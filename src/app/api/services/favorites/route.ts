import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { serviceFavorites } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { serviceId } = await req.json();
  if (!serviceId) {
    return new Response("Missing serviceId", { status: 400 });
  }

  await db
    .insert(serviceFavorites)
    .values({ userId, serviceId })
    .onConflictDoNothing();

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  if (!serviceId) {
    return new Response("Missing serviceId", { status: 400 });
  }

  await db
    .delete(serviceFavorites)
    .where(
      and(
        eq(serviceFavorites.userId, userId),
        eq(serviceFavorites.serviceId, serviceId),
      ),
    );

  return Response.json({ ok: true });
}

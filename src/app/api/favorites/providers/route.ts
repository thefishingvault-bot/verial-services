import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { favoriteProviders, providers, users } from "@/db/schema";

const generateFavoriteId = () => `fav_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      providerId: favoriteProviders.providerId,
      handle: providers.handle,
      businessName: providers.businessName,
      isVerified: providers.isVerified,
      trustLevel: providers.trustLevel,
      baseRegion: providers.baseRegion,
      avatarUrl: users.avatarUrl,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(favoriteProviders)
    .innerJoin(providers, eq(favoriteProviders.providerId, providers.id))
    .innerJoin(users, eq(providers.userId, users.id))
    .where(eq(favoriteProviders.userId, userId));

  const favorites = rows.map((row) => ({
    providerId: row.providerId,
    handle: row.handle,
    businessName: row.businessName,
    isVerified: row.isVerified,
    trustLevel: row.trustLevel,
    baseRegion: row.baseRegion,
    avatarUrl: row.avatarUrl,
    displayName: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
  }));

  return NextResponse.json({ favorites });
}

interface ToggleFavoriteBody {
  providerId?: string;
  action?: "favorite" | "unfavorite";
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ToggleFavoriteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { providerId, action } = body;

  if (!providerId || typeof providerId !== "string") {
    return NextResponse.json({ error: "providerId is required" }, { status: 400 });
  }

  if (action !== "favorite" && action !== "unfavorite") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Optionally verify provider exists
  const providerExists = await db.query.providers.findFirst({
    where: (p, { eq }) => eq(p.id, providerId),
    columns: { id: true },
  });

  if (!providerExists) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  if (action === "favorite") {
    try {
      await db.insert(favoriteProviders).values({
        id: generateFavoriteId(),
        userId,
        providerId,
      });
      console.info("favorite_created", { userId, providerId, action });
    } catch (error) {
      // Unique constraint violation -> already favorited; treat as success
      const message = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
      if (!message.includes("favorite_providers_user_id_provider_id_unique")) {
        throw error;
      }
    }
  } else {
    await db
      .delete(favoriteProviders)
      .where(and(eq(favoriteProviders.userId, userId), eq(favoriteProviders.providerId, providerId)));
    console.info("favorite_removed", { userId, providerId, action });
  }

  // Determine final state
  const finalRow = await db.query.favoriteProviders.findFirst({
    where: (fp, { and, eq }) => and(eq(fp.userId, userId), eq(fp.providerId, providerId)),
    columns: { id: true },
  });

  return NextResponse.json({ success: true, isFavorite: Boolean(finalRow) });
}

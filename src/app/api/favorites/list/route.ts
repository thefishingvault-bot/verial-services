import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserFavoriteServices, type FavoriteSort } from "@/lib/favorites";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req?: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = req?.nextUrl ?? new URL("http://localhost/api/favorites/list");
  const sortParam = url.searchParams.get("sort")?.toLowerCase();
  const sort: FavoriteSort = sortParam === "top" ? "top" : "recent";

  const favorites = await getUserFavoriteServices(userId, sort, db);
  return NextResponse.json({ items: favorites });
}

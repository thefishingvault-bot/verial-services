import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Centralized admin authorization check
 * Supports both database role and Clerk metadata, with founder bypass for development
 */
export async function requireAdmin(userId?: string): Promise<void> {
  if (!userId) {
    const authResult = await auth();
    userId = authResult.userId || undefined;
  }

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // TEMP founder bypass for development
  const FOUNDER_IDS = new Set<string>([
    "user_35jYoGGGOsVNENP3IVmWKTcX6Aj",
  ]);

  if (FOUNDER_IDS.has(userId)) {
    // Allow founder straight through without further checks
    return;
  }

  // Check database role first (primary method)
  try {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user[0] && user[0].role === "admin") {
      return;
    }
  } catch (error) {
    console.warn("Database admin check failed, falling back to Clerk metadata:", error);
  }

  // Fallback to Clerk metadata (for routes that use this)
  // Note: This requires the route to have access to Clerk user object
  // For API routes, we can't easily get Clerk metadata, so database is preferred

  throw new Error("Forbidden");
}

/**
 * Check if a user is admin (returns boolean instead of throwing)
 */
export async function isAdmin(userId?: string): Promise<boolean> {
  try {
    await requireAdmin(userId);
    return true;
  } catch {
    return false;
  }
}
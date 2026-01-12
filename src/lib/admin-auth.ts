import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

type SessionClaims = {
  publicMetadata?: Record<string, unknown>;
};

const resolveRole = async (userId: string, sessionClaims: SessionClaims | null | undefined) => {
  const sessionRole = sessionClaims?.publicMetadata?.role;
  if (typeof sessionRole === "string") return sessionRole;

  // Clerk fetch fallback
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const clerkRole = (user.publicMetadata as Record<string, unknown>)?.role as string | undefined;
    if (clerkRole) return clerkRole;
  } catch {
    // swallow and continue to DB fallback
  }

  // DB fallback
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  return dbUser?.role;
};

export async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return { isAdmin: false as const, response: new Response("Unauthorized", { status: 401 }) };
  }

  const role = await resolveRole(userId, sessionClaims as SessionClaims | null | undefined);
  if (role !== "admin") {
    return { isAdmin: false as const, response: new Response("Forbidden", { status: 403 }) };
  }

  return { isAdmin: true as const, userId, sessionClaims, role };
}

export async function assertAdminOrThrow() {
  const res = await requireAdmin();
  if (!res.isAdmin) {
    throw res.response;
  }
  return res;
}
export async function requireAdminOrNotFound() {
  const res = await requireAdmin();
  if (res.isAdmin) return res;
  notFound();
}

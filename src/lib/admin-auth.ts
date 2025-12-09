import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

export async function requireAdmin() {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as Record<string, any> | null | undefined)?.publicMetadata?.role as string | undefined;
  if (!userId || role !== "admin") {
    return { isAdmin: false as const, response: new Response("Unauthorized", { status: 401 }) };
  }
  return { isAdmin: true as const, userId, sessionClaims };
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

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const getUserRole = async (userId: string) => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const metadataRole = (user.publicMetadata as Record<string, unknown>)?.role as string | undefined;
  if (metadataRole) return metadataRole;

  // Fallback to DB role if Clerk metadata is missing
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });

  return dbUser?.role;
};

export const requireCustomer = async () => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const role = await getUserRole(userId);

  // We intentionally do NOT redirect providers here; middleware handles routing to avoid loops.
  return { userId, role: role ?? "user" };
};

export const requireProvider = async () => {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const role = await getUserRole(userId);
  if (role !== "provider" && role !== "admin") {
    redirect("/dashboard");
  }

  return { userId, role: role ?? "provider" };
};

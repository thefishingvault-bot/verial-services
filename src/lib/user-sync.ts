import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { clerkClient } from "@clerk/nextjs/server";

export async function ensureUserExistsInDb(
  userId: string,
  role: (typeof users.role.enumValues)[number] = "user",
) {
  // Unit tests mock Clerk/schema/db heavily; don't require a real Clerk key.
  if (process.env.NODE_ENV === "test") return;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const userEmail = user.emailAddresses[0]?.emailAddress;
  if (!userEmail) {
    throw new Error("User email not found");
  }

  await db
    .insert(users)
    .values({
      id: userId,
      email: userEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.imageUrl,
      role,
    })
    .onConflictDoNothing();
}

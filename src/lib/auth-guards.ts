import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const getUserRole = async (userId: string) => {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return (user.publicMetadata as Record<string, unknown>)?.role as string | undefined;
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

import { redirect } from "next/navigation";

import { MessagesShell } from "@/components/messages/messages-shell";
import { requireCustomer } from "@/lib/auth-guards";

export default async function MessagesPage() {
  const { role } = await requireCustomer();
  if (role === "provider" || role === "admin") {
    redirect("/dashboard/provider/messages");
  }

  return <MessagesShell basePath="/dashboard/messages" />;
}

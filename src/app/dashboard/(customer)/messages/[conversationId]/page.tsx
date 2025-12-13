import { redirect } from "next/navigation";

import { MessagesShell } from "@/components/messages/messages-shell";
import { requireCustomer } from "@/lib/auth-guards";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;

  const { role } = await requireCustomer();
  if (role === "provider" || role === "admin") {
    redirect(`/dashboard/provider/messages/${conversationId}`);
  }

  return <MessagesShell initialConversationId={conversationId} basePath="/dashboard/messages" />;
}


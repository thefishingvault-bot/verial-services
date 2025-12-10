import { MessagesShell } from "@/components/messages/messages-shell";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <MessagesShell initialConversationId={conversationId} />;
}


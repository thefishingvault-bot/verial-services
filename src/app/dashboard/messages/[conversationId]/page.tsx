import { MessagesShell } from "@/components/messages/messages-shell";

export default function ConversationPage({ params }: { params: { conversationId: string } }) {
  return <MessagesShell initialConversationId={params.conversationId} />;
}


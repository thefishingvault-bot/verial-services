import { MessagesShell } from "@/components/messages/messages-shell";

export default async function ProviderConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <MessagesShell
      initialConversationId={conversationId}
      basePath="/dashboard/provider/messages"
    />
  );
}

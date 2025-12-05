'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, MessageSquare } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Conversation {
  id: string;
  counterpart: {
    id: string;
    name: string;
    handle?: string;
    avatarUrl: string | null;
  };
  lastMessage: string;
  lastMessageAt: string;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch('/api/chat/conversations', { signal: controller.signal });

        if (!res.ok) {
          setConversations([]);
          setIsLoading(false);
          return;
        }

        const data: unknown = await res.json();

        const conversationsArray =
          typeof data === 'object' && data !== null &&
          Array.isArray((data as { conversations?: Conversation[] }).conversations)
            ? (data as { conversations: Conversation[] }).conversations
            : [];

        setConversations(conversationsArray);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to load conversations', error);
        }
        setConversations([]);
      } finally {
        setIsLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  if (isLoading) {
    return (
      <div className="flex p-12 justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto mt-8 border rounded-lg bg-muted/10">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">No messages yet</h3>
        <p className="text-muted-foreground">
          When you contact a provider or a customer contacts you, your conversations will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-8 flex flex-col min-h-[70vh] lg:h-[calc(100vh-5rem)]">
      <h1 className="text-3xl font-bold mb-6">Messages</h1>
      <div className="flex-1 overflow-y-auto space-y-2">
        {conversations.map((conv) => (
          <Link href={`/dashboard/messages/${conv.id}`} key={conv.id}>
            <Card className="hover:bg-accent transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <Avatar>
                  <AvatarImage src={conv.counterpart.avatarUrl || undefined} />
                  <AvatarFallback>{conv.counterpart.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-semibold truncate">{conv.counterpart.name}</h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

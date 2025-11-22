'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Send, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Pusher from 'pusher-js';

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender: {
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
}

interface ChatData {
  messages: Message[];
  otherUser: {
    id: string;
    name: string;
    avatarUrl: string | null; handle?: string;
  };
}

export default function ChatWindowPage() {
  const { user } = useUser();
  const params = useParams();
  const conversationId = params.conversationId as string;

  const [data, setData] = useState<ChatData | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;

    const fetchData = () => {
      fetch(`/api/chat/${conversationId}/messages`)
        .then((res) => res.json())
        .then((chatData: ChatData) => {
          setData(chatData);
          setIsLoading(false);
          setTimeout(scrollToBottom, 100);
        })
        .catch(() => {
          setIsLoading(false);
        });
    };

    fetchData();

    const pusher = new Pusher('b61aeb262f2da10e632d', {
      cluster: 'ap4',
    });

    const channel = pusher.subscribe(`chat-${conversationId}`);

    channel.bind('new-message', (msg: any) => {
      if (msg.senderId !== user?.id) {
        fetchData();
      }
    });

    return () => {
      pusher.unsubscribe(`chat-${conversationId}`);
    };
  }, [conversationId, user?.id]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !data) return;

    const tempContent = newMessage;
    setNewMessage('');
    setIsSending(true);

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: tempContent,
          recipientId: data.otherUser.id,
        }),
      });

      const res = await fetch(`/api/chat/${conversationId}/messages`);
      const newData: ChatData = await res.json();
      setData(newData);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Failed to send', err);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-4">Error loading chat.</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] container max-w-4xl mx-auto p-4">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b p-4 flex flex-row items-center gap-4 bg-muted/20">
          <Link href="/dashboard/messages">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Avatar>
            <AvatarImage src={data.otherUser.avatarUrl || undefined} />
            <AvatarFallback>{data.otherUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base">{data.otherUser.name}</CardTitle>
            {data.otherUser.handle && (
              <p className="text-xs text-primary">@{data.otherUser.handle}</p>
            )}
            <p className="text-xs text-muted-foreground">Ref: {conversationId.split('_')[1]}</p>
          </div>
        </CardHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {data.messages.length === 0 && (
            <p className="text-center text-muted-foreground mt-10">
              No messages yet. Say hello!
            </p>
          )}

          {data.messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`flex items-end gap-2 max-w-[80%] ${
                    isMe ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {!isMe && (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                      <AvatarFallback>
                        {msg.sender?.firstName?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`p-3 rounded-lg ${
                      isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <span className="text-[10px] opacity-70 block mt-1 text-right">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>

        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              disabled={isSending}
            />
            <Button type="submit" size="icon" disabled={isSending || !newMessage.trim()}>
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

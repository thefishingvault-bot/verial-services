"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Send } from "lucide-react";
import Pusher from "pusher-js";
import { ConversationHeader } from "@/components/messages/conversation-header";

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

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

interface ChatData {
  messages: Message[];
  otherUser: {
    id: string;
    name: string;
    avatarUrl: string | null;
    handle?: string;
    role: "provider" | "customer";
    rating?: number;
    jobsCompleted?: number;
    isVerified?: boolean;
  };
  booking: {
    id: string;
    publicRef: string;
    serviceTitle: string;
    scheduledAt: string;
    totalInCents: number;
    includesGst: boolean;
    status: BookingStatus;
  } | null;
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

  const bookingRef = useMemo(() => {
    if (!conversationId) return "";
    const parts = conversationId.split("_");
    return parts[1] ?? conversationId;
  }, [conversationId]);

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

    channel.bind('new-message', (msg: Message) => {
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

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col bg-muted/10">
      {data && data.booking ? (
        <ConversationHeader
          counterpartName={data.otherUser.name}
          counterpartHandle={
            data.otherUser.handle ? `@${data.otherUser.handle}` : "@customer"
          }
          counterpartAvatarUrl={data.otherUser.avatarUrl}
          counterpartRole={data.otherUser.role}
          serviceTitle={data.booking.serviceTitle}
          bookingId={data.booking.id}
          bookingPublicRef={data.booking.publicRef || bookingRef}
          scheduledAt={data.booking.scheduledAt}
          amountInCents={data.booking.totalInCents}
          includesGst={data.booking.includesGst}
          status={data.booking.status}
          rating={data.otherUser.rating}
          jobsCompleted={data.otherUser.jobsCompleted}
          isVerified={data.otherUser.isVerified}
          bookingUrl={`/dashboard/bookings/${data.booking.id}`}
          profileUrl={"/dashboard/messages"}
          listHref="/dashboard/messages"
        />
      ) : (
        <div className="flex items-center justify-center border-b bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading conversation...</p>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && !data && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          {!isLoading && !data && (
            <p className="p-4 text-sm text-muted-foreground">
              Error loading chat. Please try again.
            </p>
          )}

          {data && data.messages.length === 0 && !isLoading && (
            <p className="mt-10 text-center text-muted-foreground">
              No messages yet. Say hello!
            </p>
          )}
          {data && data.messages.map((msg) => {
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

        <div className="border-t bg-background p-4">
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
      </div>
    </div>
  );
}

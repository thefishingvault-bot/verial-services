"use client";

import { useState } from "react";

import { ChatInput } from "@/components/messages/chat-input";

interface SenderInfo {
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender: SenderInfo;
}

interface CounterpartInfo {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
}

interface ChatThreadProps {
  conversationId: string;
  viewerUserId: string | null;
  counterpart: CounterpartInfo;
  initialMessages: Message[];
}

export function ChatThread({
  conversationId,
  viewerUserId,
  counterpart,
  initialMessages,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-xs text-muted-foreground">
            Say hi to get the conversation started.
          </p>
        )}

        {messages.map((msg) => {
          const isMe = viewerUserId === msg.senderId;
          const displayName = isMe ? "You" : counterpart.name;
          const otherInitial = counterpart.name.charAt(0).toUpperCase();

          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[70%] items-end gap-2 ${
                  isMe ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {!isMe && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {otherInitial}
                  </div>
                )}

                <div
                  className={`rounded-lg p-3 text-sm ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="mb-1 text-[11px] font-medium opacity-80">
                    {displayName}
                  </p>
                  <p>{msg.content}</p>
                  <span
                    className={`mt-1 block text-[10px] opacity-70 ${
                      isMe ? "text-right" : "text-left"
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t bg-background p-4">
        <ChatInput
          conversationId={conversationId}
          onMessageSent={(msg) =>
            setMessages((prev) => [
              ...prev,
              {
                ...msg,
                sender: {
                  firstName: null,
                  lastName: null,
                  avatarUrl: counterpart.avatarUrl,
                },
              },
            ])
          }
        />
      </div>
    </div>
  );
}

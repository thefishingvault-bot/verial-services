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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/10 px-3 py-3 md:px-6 md:py-6">
        <div className="mx-auto flex max-w-2xl flex-1 flex-col justify-end space-y-2 md:space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-xs text-muted-foreground">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-base font-medium">
                💬
              </div>
              <p className="mb-1 font-medium text-foreground">No messages yet</p>
              <p className="max-w-xs text-[11px] text-muted-foreground">
                Send a message to get the conversation started.
              </p>
            </div>
          ) : null}

          {messages.map((msg, index) => {
            const isMe = viewerUserId === msg.senderId;
            const displayName = isMe ? "You" : counterpart.name;
            const otherInitial = counterpart.name.charAt(0).toUpperCase();

            const previous = messages[index - 1];
            const isSameSenderAsPrevious =
              !!previous && previous.senderId === msg.senderId;

            return (
              <div key={msg.id} className="flex justify-start">
                <div
                  className="flex max-w-[75%] items-end gap-2 flex-row"
                >
                  {!isMe && !isSameSenderAsPrevious && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {otherInitial}
                    </div>
                  )}

                  <div
                    className={`overflow-hidden rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground"
                    }`}
                  >
                    {!isSameSenderAsPrevious && (
                      <p className="mb-0.5 text-[11px] font-medium opacity-80">
                        {displayName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                    <span
                      className="mt-1 block text-[10px] opacity-70 transition-opacity text-left"
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
      </div>

      <div className="border-t bg-background px-4 py-3 md:px-6 md:py-4">
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

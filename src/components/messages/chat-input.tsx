"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatInputProps {
  conversationId: string;
  onMessageSent?: (message: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
  }) => void;
}

export function ChatInput({ conversationId, onMessageSent }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content: trimmed }),
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }

      const json = (await res.json()) as {
        id: string;
        content: string;
        senderId: string;
        createdAt: string;
      };

      setValue("");
      onMessageSent?.(json);
    } catch (err) {
      console.error(err);
      setError("Could not send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message…"
        disabled={isSending}
        className="flex-1"
      />
      <Button
        type="submit"
        disabled={!value.trim() || isSending}
        className="sm:ml-2"
      >
        {isSending ? "Sending…" : "Send"}
      </Button>
      {error && (
        <p className="text-xs text-red-500 sm:ml-2 sm:mt-0 mt-1">{error}</p>
      )}
    </form>
  );
}

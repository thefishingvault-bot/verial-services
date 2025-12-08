"use client";

import { KeyboardEvent, useState } from "react";

import { Button } from "@/components/ui/button";

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

	async function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || isSending) return;

		try {
			setIsSending(true);
			const res = await fetch(`/api/messages/send`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ threadId: conversationId, content: trimmed }),
			});

			if (!res.ok) {
				throw new Error("Failed to send message");
			}

			const json = await res.json();

			setValue("");
			onMessageSent?.({
				id: json.serverMessageId ?? json.id,
				content: json.content,
				senderId: json.senderId,
				createdAt: json.createdAt,
			});
		} catch (error) {
			if (process.env.NODE_ENV !== "production") {
				console.error("[CHAT_INPUT_SEND]", error);
			}
		} finally {
			setIsSending(false);
		}
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	}

	const disabled = !value.trim() || isSending;

	return (
		<div className="flex items-end gap-3">
			<div className="flex-1">
				<div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-sky-500">
					<textarea
						className="max-h-32 min-h-[44px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Type a message..."
						disabled={isSending}
					/>
				</div>
			</div>
			<Button
				type="button"
				onClick={handleSend}
				disabled={disabled}
				className="h-9 px-4 text-sm disabled:opacity-50"
			>
				Send
			</Button>
		</div>
	);
}

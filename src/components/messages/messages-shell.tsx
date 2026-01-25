"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, Check, CheckCheck, Clock, Loader2, Paperclip, Send, Smile } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { applyDeliveryStatus, normalizeMessage, replaceTempMessage, type ServerMessage, UiMessage, upsertMessages } from "@/lib/messaging-client";
import type { PresenceRecord } from "@/lib/presence";
import { pusherClient } from "@/lib/pusher-client";
import { cn } from "@/lib/utils";

interface ThreadSummary {
	id: string;
	threadId: string;
	serviceTitle?: string | null;
	counterpart: { id: string; name: string; avatarUrl: string | null };
	lastMessage: string | null;
	lastMessageAt: string | Date | null;
	unreadCount: number;
	status?: string;
}

interface ThreadState {
	messages: UiMessage[];
	nextCursor: string | null;
	counterpart: ThreadSummary["counterpart"] | null;
	isLoading: boolean;
	isAppending: boolean;
}

interface ThreadResponse {
	messages: ServerMessage[];
	counterpart: ThreadSummary["counterpart"] | null;
	nextCursor: string | null;
}

type ThreadsResponseItem = {
	bookingId: string;
	serviceTitle?: string | null;
	counterpart: ThreadSummary["counterpart"];
	lastMessage: string | null;
	lastMessageAt: string | Date | null;
	unreadCount?: number;
	status?: string;
};

interface Props {
	initialConversationId?: string | null;
	basePath?: string;
}

const PAGE_SIZE = 50;
const HEARTBEAT_MS = 25000;

type MessageAttachment = {
	type: "image";
	url: string;
	name?: string;
	size?: number;
};

const getAttachments = (value: unknown): MessageAttachment[] => {
	if (!Array.isArray(value)) return [];
	const out: MessageAttachment[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const obj = item as { type?: unknown; url?: unknown; name?: unknown; size?: unknown };
		if (obj.type !== "image") continue;
		if (typeof obj.url !== "string" || !obj.url) continue;
		out.push({
			type: "image",
			url: obj.url,
			name: typeof obj.name === "string" ? obj.name : undefined,
			size: typeof obj.size === "number" ? obj.size : undefined,
		});
	}
	return out;
};

const EMOJI_SET = ["😀", "😁", "😂", "😊", "😍", "😘", "😅", "😎", "🤔", "😢", "😡", "👍", "🙏", "👏", "🔥", "🎉", "💯", "❤️", "✨", "✅", "📅", "📌", "📎", "🚀"];

type SavedReply = {
	id: string;
	title: string;
	body: string;
};

const presenceStale = (p?: PresenceRecord | undefined | null) => {
	if (!p) return true;
	return Date.now() - p.lastActive > 5 * 60 * 1000;
};

export function MessagesShell({ initialConversationId = null, basePath = "/dashboard/messages" }: Props) {
	const router = useRouter();
	const { user } = useUser();
	const viewerId = user?.id ?? null;
	const [threads, setThreads] = useState<ThreadSummary[]>([]);
	const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
	const [threadState, setThreadState] = useState<Record<string, ThreadState>>({});
	const [isLoadingThreads, setIsLoadingThreads] = useState(true);
	const [isSending, setIsSending] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const [presence, setPresence] = useState<Record<string, PresenceRecord>>({});
	const [typing, setTyping] = useState<Record<string, boolean>>({});
	const [draft, setDraft] = useState("");
	const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
	const [composerError, setComposerError] = useState<string | null>(null);
	const isProviderView = basePath.startsWith("/dashboard/provider/messages");
	const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
	const [savedRepliesStatus, setSavedRepliesStatus] = useState<"idle" | "loading" | "available" | "upgrade" | "error">("idle");
	const [savedReplySelectedId, setSavedReplySelectedId] = useState<string | null>(null);
	const [showSavedRepliesManager, setShowSavedRepliesManager] = useState(false);
	const [newReplyTitle, setNewReplyTitle] = useState("");
	const [newReplyBody, setNewReplyBody] = useState("");
	const [isSavingReply, setIsSavingReply] = useState(false);
	const listRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const composerRef = useRef<HTMLTextAreaElement | null>(null);

	const activeState = activeId ? threadState[activeId] : undefined;
	const orderedMessages = useMemo(() => {
		if (!activeState) return [] as UiMessage[];
		return [...activeState.messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
	}, [activeState]);

	const fetchPresence = useCallback(async (userIds: string[]) => {
		if (!viewerId) return;
		if (!userIds.length) return;
		const params = new URLSearchParams();
		userIds.forEach((id) => params.append("userId", id));
		const res = await fetch(`/api/presence?${params.toString()}`, { cache: "no-store" });
		if (!res.ok) return;
		const data = (await res.json()) as { presence: Record<string, PresenceRecord> };
		setPresence((prev) => ({ ...prev, ...(data.presence || {}) }));
	}, [viewerId]);

	const heartbeat = useCallback(async () => {
		if (!viewerId) return;
		await fetch("/api/presence", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status: "online" }),
		});
	}, [viewerId]);

	const loadThreads = useCallback(async () => {
		setIsLoadingThreads(true);
		try {
			const res = await fetch("/api/messages/threads", { cache: "no-store" });
			if (!res.ok) throw new Error("Failed to load threads");
			const data = (await res.json()) as { threads?: ThreadsResponseItem[] };
			const mapped: ThreadSummary[] = (data.threads || []).map((t) => ({
				id: t.bookingId,
				threadId: t.bookingId,
				serviceTitle: t.serviceTitle,
				counterpart: t.counterpart,
				lastMessage: t.lastMessage,
				lastMessageAt: t.lastMessageAt,
				unreadCount: t.unreadCount ?? 0,
				status: t.status,
			}));
			setThreads(mapped);
			void fetchPresence(mapped.map((t) => t.counterpart.id));
		} catch (error) {
			console.error("[MESSAGES_THREADS]", error);
			setThreads([]);
		} finally {
			setIsLoadingThreads(false);
		}
	}, [fetchPresence]);

	const loadSavedReplies = useCallback(async () => {
		if (!isProviderView) return;
		setSavedRepliesStatus("loading");
		try {
			const res = await fetch("/api/provider/saved-replies", { cache: "no-store" });
			if (res.status === 403) {
				setSavedReplies([]);
				setSavedRepliesStatus("upgrade");
				return;
			}
			if (!res.ok) throw new Error("Failed to load saved replies");
			const data = (await res.json()) as { replies?: SavedReply[] };
			setSavedReplies(Array.isArray(data.replies) ? data.replies : []);
			setSavedRepliesStatus("available");
		} catch (error) {
			console.error("[SAVED_REPLIES_LOAD]", error);
			setSavedReplies([]);
			setSavedRepliesStatus("error");
		}
	}, [isProviderView]);

	const loadThread = useCallback(
		async (threadId: string, cursor?: string | null, append = false) => {
			setThreadState((prev) => ({
				...prev,
				[threadId]: {
					messages: prev[threadId]?.messages ?? [],
					nextCursor: prev[threadId]?.nextCursor ?? null,
					counterpart: prev[threadId]?.counterpart ?? null,
					isLoading: !append,
					isAppending: append,
				},
			}));

			const url = new URL(`/api/messages/${threadId}`, window.location.origin);
			url.searchParams.set("limit", String(PAGE_SIZE));
			if (cursor) url.searchParams.set("cursor", cursor);

			const res = await fetch(url.toString(), { cache: "no-store" });
			if (!res.ok) {
				setThreadState((prev) => ({
					...prev,
					[threadId]: {
						messages: prev[threadId]?.messages ?? [],
						nextCursor: prev[threadId]?.nextCursor ?? null,
						counterpart: prev[threadId]?.counterpart ?? null,
						isLoading: false,
						isAppending: false,
					},
				}));
				return;
			}
			const data = (await res.json()) as ThreadResponse;
			setThreadState((prev) => {
				const existing = prev[threadId]?.messages ?? [];
				const merged = upsertMessages(existing, data.messages || [], viewerId ?? undefined, undefined);
				return {
					...prev,
					[threadId]: {
						messages: merged,
						nextCursor: data.nextCursor,
						counterpart: data.counterpart ?? prev[threadId]?.counterpart ?? null,
						isLoading: false,
						isAppending: false,
					},
				};
			});

			const last = data.messages?.[data.messages.length - 1];
			if (last) {
				await fetch("/api/messages/mark-read", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ threadId, lastMessageId: last.serverMessageId }),
				}).catch(() => undefined);
				setThreads((prev) => prev.map((t) => (t.threadId === threadId ? { ...t, unreadCount: 0 } : t)));
			}
		},
		[viewerId],
	);

	const handleSelectConversation = useCallback(
		(id: string) => {
			setActiveId(id);
			router.replace(`${basePath}/${id}`);
			setThreadState((prev) => ({
				...prev,
				[id]: {
					messages: prev[id]?.messages ?? [],
					nextCursor: prev[id]?.nextCursor ?? null,
					counterpart: prev[id]?.counterpart ?? threads.find((t) => t.threadId === id)?.counterpart ?? null,
					isLoading: prev[id]?.isLoading ?? false,
					isAppending: prev[id]?.isAppending ?? false,
				},
			}));
			const current = threadState[id];
			if (!current || !current.messages.length) {
				void loadThread(id);
			}
		},
		[router, threadState, loadThread, threads, basePath],
	);

	const scrollToBottom = useCallback(() => {
		requestAnimationFrame(() => {
			if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		});
	}, []);

	const insertIntoComposer = useCallback((text: string) => {
		const el = composerRef.current;
		if (!el) {
			setDraft((prev) => `${prev}${text}`);
			return;
		}

		const start = el.selectionStart ?? el.value.length;
		const end = el.selectionEnd ?? el.value.length;
		setDraft((prev) => {
			const before = prev.slice(0, start);
			const after = prev.slice(end);
			return `${before}${text}${after}`;
		});
		requestAnimationFrame(() => {
			el.focus();
			const next = start + text.length;
			el.setSelectionRange(next, next);
		});
	}, []);

	const presignAndUploadAttachment = useCallback(async (file: File): Promise<MessageAttachment> => {
		setComposerError(null);
		const maxBytes = 5 * 1024 * 1024;
		if (!file.type.startsWith("image/")) {
			throw new Error("Only image attachments are supported.");
		}
		if (file.size > maxBytes) {
			throw new Error("Image exceeds 5MB limit.");
		}

		const presignRes = await fetch("/api/uploads/presign-message-attachment", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ fileType: file.type, fileSize: file.size }),
		});
		if (!presignRes.ok) {
			throw new Error("Failed to prepare upload.");
		}
		const data = (await presignRes.json()) as { uploadUrl?: string; publicUrl?: string };
		if (!data.uploadUrl || !data.publicUrl) {
			throw new Error("Upload configuration missing.");
		}

		const putRes = await fetch(data.uploadUrl, {
			method: "PUT",
			headers: { "Content-Type": file.type },
			body: file,
		});
		if (!putRes.ok) {
			throw new Error("Upload failed.");
		}

		return { type: "image", url: data.publicUrl, name: file.name, size: file.size };
	}, []);

	const sendMessage = useCallback(
		async (params: { content: string; attachments?: MessageAttachment[] }) => {
			if (!activeId) return false;
			const trimmed = params.content.trim();
			const attachments = params.attachments?.length ? params.attachments : undefined;
			if (!trimmed) return false;
			let success = false;
			const tempId = `temp-${crypto.randomUUID()}`;
			const optimistic = normalizeMessage(
				{
					serverMessageId: tempId,
					clientTempId: tempId,
					bookingId: activeId,
					threadId: activeId,
					senderId: viewerId ?? "me",
					recipientId: "counterpart",
					content: trimmed,
					attachments,
					createdAt: new Date().toISOString(),
				},
				viewerId ?? "me",
				{ status: "sending" },
			);

			setThreadState((prev) => ({
				...prev,
				[activeId]: {
					messages: [...(prev[activeId]?.messages ?? []), optimistic],
					nextCursor: prev[activeId]?.nextCursor ?? null,
					counterpart: prev[activeId]?.counterpart ?? null,
					isLoading: false,
					isAppending: false,
				},
			}));
			scrollToBottom();

			setIsSending(true);
			try {
				const res = await fetch("/api/messages/send", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ threadId: activeId, content: trimmed, tempId, attachments }),
				});
				if (!res.ok) throw new Error("Failed to send message");
				const serverMsg = await res.json();
				setThreadState((prev) => ({
					...prev,
					[activeId]: {
						...prev[activeId],
						messages: replaceTempMessage(prev[activeId]?.messages ?? [], serverMsg, viewerId ?? undefined),
						isLoading: false,
						isAppending: false,
					},
				}));
				setThreads((prev) =>
					prev.map((t) =>
						t.threadId === activeId
							? { ...t, lastMessage: serverMsg.content, lastMessageAt: serverMsg.createdAt, unreadCount: 0 }
							: t,
					),
				);
				scrollToBottom();
				success = true;
			} catch (error) {
				console.error("[MESSAGE_SEND]", error);
				setThreadState((prev) => ({
					...prev,
					[activeId]: {
						...prev[activeId],
						messages: applyDeliveryStatus(prev[activeId]?.messages ?? [], tempId, "failed"),
						isLoading: false,
						isAppending: false,
					},
				}));
			} finally {
				setIsSending(false);
			}
			return success;
		},
		[activeId, scrollToBottom, viewerId],
	);

	const handleSendAction = useCallback(async () => {
		setComposerError(null);
		const ok = await sendMessage({ content: draft });
		if (ok) setDraft("");
	}, [draft, sendMessage]);

	const handleAttachmentClick = useCallback(() => {
		setComposerError(null);
		fileInputRef.current?.click();
	}, []);

	const handleAttachmentChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			if (!activeId) return;
			const file = e.target.files?.[0] ?? null;
			e.target.value = "";
			if (!file) return;

			setIsUploadingAttachment(true);
			try {
				const attachment = await presignAndUploadAttachment(file);
				const content = draft.trim() ? draft : file.name || "Image attachment";
				const ok = await sendMessage({ content, attachments: [attachment] });
				if (ok) setDraft("");
			} catch (error) {
				const message = error instanceof Error ? error.message : "Attachment failed.";
				setComposerError(message);
				console.error("[MESSAGE_ATTACHMENT]", error);
			} finally {
				setIsUploadingAttachment(false);
			}
		},
		[activeId, draft, presignAndUploadAttachment, sendMessage],
	);

	const handleIncoming = useCallback(
		(threadId: string, payload: ServerMessage) => {
			setThreadState((prev) => {
				const existing = prev[threadId]?.messages ?? [];
				const merged = upsertMessages(existing, [payload], viewerId ?? undefined);
				return {
					...prev,
					[threadId]: {
						messages: merged,
						nextCursor: prev[threadId]?.nextCursor ?? null,
						counterpart: prev[threadId]?.counterpart ?? null,
						isLoading: false,
						isAppending: false,
					},
				};
			});
			setThreads((prev) => {
				const found = prev.find((t) => t.threadId === threadId);
				if (!found) return prev;
				const isActive = activeId === threadId;
				return prev.map((t) =>
					t.threadId === threadId
						? {
								...t,
								lastMessage: payload.content,
								lastMessageAt: payload.createdAt,
								unreadCount: isActive ? 0 : (t.unreadCount ?? 0) + 1,
							}
						: t,
				);
			});
			if (threadId === activeId) {
				scrollToBottom();
				void fetch("/api/messages/mark-read", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ threadId, lastMessageId: payload.serverMessageId }),
				}).catch(() => undefined);
			}
		},
		[activeId, scrollToBottom, viewerId],
	);

	const bindPusher = useCallback(
		(threadId: string) => {
			if (!pusherClient) return;
			const channel = pusherClient.subscribe(`private-thread-${threadId}`);
			channel.bind("message:new", (data: ServerMessage) => handleIncoming(threadId, data));
			channel.bind("message:delivered", (data: { serverMessageId: string }) => {
				setThreadState((prev) => ({
					...prev,
					[threadId]: {
						...prev[threadId],
						messages: applyDeliveryStatus(prev[threadId]?.messages ?? [], data.serverMessageId, "delivered"),
						nextCursor: prev[threadId]?.nextCursor ?? null,
						counterpart: prev[threadId]?.counterpart ?? null,
						isLoading: false,
						isAppending: false,
					},
				}));
			});
			channel.bind("message:seen", (data: { serverMessageId: string }) => {
				setThreadState((prev) => ({
					...prev,
					[threadId]: {
						...prev[threadId],
						messages: applyDeliveryStatus(prev[threadId]?.messages ?? [], data.serverMessageId, "seen"),
						nextCursor: prev[threadId]?.nextCursor ?? null,
						counterpart: prev[threadId]?.counterpart ?? null,
						isLoading: false,
						isAppending: false,
					},
				}));
			});
			channel.bind("thread:unread", (data: { unreadCount: number }) => {
				setThreads((prev) => prev.map((t) => (t.threadId === threadId ? { ...t, unreadCount: data.unreadCount } : t)));
			});
			channel.bind("typing", (data: { isTyping: boolean }) => {
				setTyping((prev) => ({ ...prev, [threadId]: data.isTyping }));
				setTimeout(() => setTyping((prev) => ({ ...prev, [threadId]: false })), 3000);
			});
			return () => {
				channel.unbind_all();
				pusherClient?.unsubscribe(`private-thread-${threadId}`);
			};
		},
		[handleIncoming],
	);

	const bindPresence = useCallback(() => {
		if (!pusherClient) return;
		const channel = pusherClient.subscribe("presence-global");
		channel.bind("presence:update", (data: { userId: string; status: PresenceRecord["status"]; lastActive: number }) => {
			setPresence((prev) => ({ ...prev, [data.userId]: { status: data.status, lastActive: data.lastActive } }));
		});
		return () => {
			channel.unbind_all();
			pusherClient?.unsubscribe("presence-global");
		};
	}, []);

	useEffect(() => {
		void loadThreads();
	}, [loadThreads]);

	useEffect(() => {
		void loadSavedReplies();
	}, [loadSavedReplies]);

	useEffect(() => {
		const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 1024);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	useEffect(() => {
		if (activeId) void loadThread(activeId);
	}, [activeId, loadThread]);

	const insertSavedReply = useCallback(() => {
		if (!savedReplySelectedId) return;
		const found = savedReplies.find((r) => r.id === savedReplySelectedId);
		if (!found) return;
		setDraft((prev) => {
			if (!prev.trim()) return found.body;
			return `${prev.trimEnd()}\n\n${found.body}`;
		});
	}, [savedReplySelectedId, savedReplies]);

	const createSavedReply = useCallback(async () => {
		if (!isProviderView) return;
		const title = newReplyTitle.trim();
		const body = newReplyBody.trim();
		if (!title || !body) return;
		setIsSavingReply(true);
		try {
			const res = await fetch("/api/provider/saved-replies", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title, body }),
			});
			if (res.status === 403) {
				setSavedRepliesStatus("upgrade");
				return;
			}
			if (!res.ok) throw new Error("Failed to create saved reply");
			const created = (await res.json()) as SavedReply;
			setSavedReplies((prev) => [created, ...prev]);
			setNewReplyTitle("");
			setNewReplyBody("");
			setSavedRepliesStatus("available");
		} catch (error) {
			console.error("[SAVED_REPLIES_CREATE]", error);
			setSavedRepliesStatus("error");
		} finally {
			setIsSavingReply(false);
		}
	}, [isProviderView, newReplyBody, newReplyTitle]);

	const deleteSavedReply = useCallback(async (id: string) => {
		if (!isProviderView) return;
		try {
			const res = await fetch(`/api/provider/saved-replies/${id}`, { method: "DELETE" });
			if (res.status === 403) {
				setSavedRepliesStatus("upgrade");
				return;
			}
			if (!res.ok) throw new Error("Failed to delete saved reply");
			setSavedReplies((prev) => prev.filter((r) => r.id !== id));
			if (savedReplySelectedId === id) setSavedReplySelectedId(null);
		} catch (error) {
			console.error("[SAVED_REPLIES_DELETE]", error);
			setSavedRepliesStatus("error");
		}
	}, [isProviderView, savedReplySelectedId]);

	useEffect(() => {
		const cleanup = activeId ? bindPusher(activeId) : undefined;
		return () => {
			if (cleanup) cleanup();
		};
	}, [activeId, bindPusher]);

	useEffect(() => {
		const cleanup = bindPresence();
		return () => {
			if (cleanup) cleanup();
		};
	}, [bindPresence]);

	useEffect(() => {
		void heartbeat();
		const id = setInterval(() => void heartbeat(), HEARTBEAT_MS);
		return () => clearInterval(id);
	}, [heartbeat]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const onScroll = () => {
			if (!activeId) return;
			if (!activeState?.nextCursor || activeState.isAppending) return;
			if (el.scrollTop < 60) {
				void loadThread(activeId, activeState.nextCursor, true);
			}
		};
		el.addEventListener("scroll", onScroll);
		return () => el.removeEventListener("scroll", onScroll);
	}, [activeId, activeState?.nextCursor, activeState?.isAppending, loadThread]);

	const [isHydrated, setIsHydrated] = useState(false);
	useEffect(() => {
		setIsHydrated(true);
	}, []);

	const activeThread = threads.find((t) => t.threadId === activeId) ?? null;
	const counterpartName = activeState?.counterpart?.name || activeThread?.counterpart.name;
	const counterpartId = activeState?.counterpart?.id || activeThread?.counterpart.id;
	const counterpartPresence = counterpartId ? presence[counterpartId] : null;

	// Mobile: make this page a self-contained viewport between the sticky top header and fixed bottom nav.
	// This prevents page-level scrolling and ensures the message list can flex + scroll internally.
	const mobileTopPx = isProviderView ? 56 : 64; // provider header: h-14, customer SiteHeader: h-16
	const mobileBottomOffset = "calc(64px + env(safe-area-inset-bottom))"; // bottom nav: h-16 + safe-area

	return (
		<div
			className={cn(
				"flex flex-col overflow-hidden bg-muted/10 lg:flex-row",
				isMobile ? "fixed inset-x-0 z-40" : "min-h-0 flex-1",
			)}
			style={
				isMobile
					? { top: `${mobileTopPx}px`, bottom: mobileBottomOffset }
					: undefined
			}
		>
			<Card
				ref={listRef}
				className={cn(
					"flex min-h-0 flex-col border-r lg:w-96 lg:shrink-0",
					activeId && isMobile ? "hidden" : "block w-full",
				)}
			>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<div>
						<p className="text-xs uppercase tracking-wide text-muted-foreground">Inbox</p>
						<h2 className="text-lg font-semibold">Messages</h2>
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">
					{isLoadingThreads ? (
						<div className="space-y-3 p-4">
							{Array.from({ length: 5 }).map((_, i) => (
								<div key={i} className="animate-pulse rounded-lg bg-muted/50 p-4" />
							))}
						</div>
					) : threads.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
							<p className="font-medium text-foreground">No conversations yet</p>
							<p className="text-xs text-muted-foreground">Send your first message to start a conversation.</p>
						</div>
					) : (
						<ul className="divide-y">
							{threads.map((conv) => {
								const userPresence = presence[conv.counterpart.id];
								const isOnline = userPresence && !presenceStale(userPresence) && userPresence.status !== "offline";
								return (
									<li key={conv.threadId}>
										<button
											className={cn(
												"flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60",
												conv.threadId === activeId && "bg-muted/80",
											)}
											onClick={() => handleSelectConversation(conv.threadId)}
										>
											<div className="relative">
												<Avatar className="h-10 w-10">
													{conv.counterpart.avatarUrl && (
														<AvatarImage src={conv.counterpart.avatarUrl} alt={conv.counterpart.name} />
													)}
													<AvatarFallback>{conv.counterpart.name.charAt(0).toUpperCase()}</AvatarFallback>
												</Avatar>
												<span
													className={cn(
														"absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border border-background",
														isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
													)}
												/>
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between gap-2">
													<p className="truncate text-sm font-medium">{conv.counterpart.name}</p>
													<span className="whitespace-nowrap text-[11px] text-muted-foreground">
														{isHydrated && conv.lastMessageAt
															? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })
															: ""}
													</span>
												</div>
												<p className="truncate text-[12px] text-muted-foreground">{conv.lastMessage || "No messages yet"}</p>
												{conv.serviceTitle && <p className="truncate text-[11px] text-muted-foreground">{conv.serviceTitle}</p>}
											</div>
											{conv.unreadCount > 0 && (
												<Badge className="ml-1 bg-primary text-primary-foreground">{conv.unreadCount}</Badge>
											)}
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</Card>

			<div className={cn("flex min-h-0 flex-1 flex-col", activeId || !isMobile ? "block" : "hidden")}>
				{!activeId ? (
					<div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
						<p className="mb-2 text-base font-semibold text-foreground">Select a conversation</p>
						<p className="max-w-sm text-xs text-muted-foreground">
							Conversations are limited to customers and providers with an active or completed booking.
						</p>
					</div>
				) : activeState?.isLoading && !activeState.messages.length ? (
					<div className="flex h-full items-center justify-center text-muted-foreground">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				) : !activeState ? (
					<div className="flex h-full items-center justify-center text-red-500 text-sm">Unable to load conversation.</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col">
						<div className="flex items-center gap-3 border-b px-4 py-3">
							{isMobile && (
								<Button variant="ghost" size="icon" onClick={() => setActiveId(null)}>
									<ArrowLeft className="h-5 w-5" />
								</Button>
							)}
							<div className="relative">
								<Avatar className="h-9 w-9">
									{activeState.counterpart?.avatarUrl && (
										<AvatarImage src={activeState.counterpart.avatarUrl} alt={counterpartName || "User"} />
									)}
									<AvatarFallback>{counterpartName?.charAt(0).toUpperCase() ?? "?"}</AvatarFallback>
								</Avatar>
								<span
									className={cn(
										"absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border border-background",
										counterpartPresence && !presenceStale(counterpartPresence)
											? "bg-emerald-500"
											: "bg-muted-foreground/40",
									)}
								/>
							</div>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold">{counterpartName ?? "Conversation"}</p>
								<p className="text-xs text-muted-foreground">
									{counterpartPresence && !presenceStale(counterpartPresence)
										? "Online"
										: counterpartPresence
													? isHydrated
														? `Last active ${formatDistanceToNow(new Date(counterpartPresence.lastActive))} ago`
														: ""
											: "Secure, booking-only messaging"}
								</p>
							</div>
							{typing[activeId] && <span className="text-[11px] text-muted-foreground">Typing…</span>}
						</div>

						<div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/10 px-4 py-4">
							{activeState.isAppending && (
								<div className="flex justify-center py-2 text-xs text-muted-foreground">
									<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading older messages…
								</div>
							)}
							{orderedMessages.length === 0 ? (
								<div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
									No messages yet. Start the conversation!
								</div>
							) : (
								orderedMessages.map((msg, idx) => {
									const prev = orderedMessages[idx - 1];
									const sameDay =
										isHydrated && prev
											? format(new Date(prev.createdAt), "yyyy-MM-dd") ===
												format(new Date(msg.createdAt), "yyyy-MM-dd")
											: false;
									const showDay = isHydrated ? !sameDay : false;
									const isMe = viewerId ? msg.senderId === viewerId : msg.senderId !== activeState.counterpart?.id;
									const statusIcon =
										msg.status === "sending" ? (
											<Clock className="h-3 w-3" />
										) : msg.status === "delivered" ? (
											<Check className="h-3 w-3" />
										) : msg.status === "seen" ? (
											<CheckCheck className="h-3 w-3" />
										) : (
											<Check className="h-3 w-3" />
										);
									return (
										<div key={msg.serverMessageId || msg.clientTempId}>
											{showDay && (
												<div className="mb-2 text-center text-[11px] text-muted-foreground">
													{format(new Date(msg.createdAt), "PPP")}
												</div>
											)}
											<div className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}>
												<div
													className={cn(
														"max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
														isMe ? "bg-primary text-primary-foreground" : "bg-background text-foreground",
													)}
												>
													<p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
													{(() => {
														const attachments = getAttachments(msg.attachments);
														if (!attachments.length) return null;
														return (
															<div className="mt-2 space-y-2">
																{attachments.map((att) => (
																	<a
																		key={att.url}
																		href={att.url}
																		target="_blank"
																		rel="noreferrer"
																		className="block"
																	>
																		<img
																			src={att.url}
																			alt={att.name ?? "Attachment"}
																			className="max-h-48 w-auto max-w-full rounded-lg bg-background/20"
																			loading="lazy"
																		/>
																		{att.name && (
																			<p className={cn("mt-1 truncate text-[11px]", isMe ? "text-primary-foreground/80" : "text-muted-foreground")}>
																				{att.name}
																			</p>
																		)}
																	</a>
																))}
															</div>
														);
													})()}
													<div
														className={cn(
															"mt-1 flex items-center gap-1 text-[10px]",
															isMe ? "text-primary-foreground/80" : "text-muted-foreground",
														)}
													>
														<span>{isHydrated ? format(new Date(msg.createdAt), "p") : ""}</span>
														{isMe && statusIcon}
													</div>
												</div>
											</div>
										</div>
									);
								})
							)}
						</div>

						<div className="border-t bg-background px-4 py-3">
							{isProviderView && (
								<div className="mb-3 space-y-2">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-xs text-muted-foreground">Saved replies</span>
										{savedRepliesStatus === "upgrade" ? (
											<div className="flex items-center gap-2 text-xs">
												<span className="text-muted-foreground">Pro/Elite feature</span>
												<Button asChild size="sm" variant="outline">
													<Link href="/dashboard/provider/billing">Upgrade</Link>
												</Button>
											</div>
										) : (
											<>
												<Select value={savedReplySelectedId ?? ""} onValueChange={(v) => setSavedReplySelectedId(v)}>
													<SelectTrigger className="h-8 w-55">
														<SelectValue placeholder={savedRepliesStatus === "loading" ? "Loading…" : "Choose…"} />
													</SelectTrigger>
													<SelectContent>
														{savedReplies.length === 0
															? (
																<SelectItem value="__none" disabled>
																	No saved replies yet
																</SelectItem>
															)
															: savedReplies.map((r) => (
																<SelectItem key={r.id} value={r.id}>
																	{r.title}
																</SelectItem>
															))}
												</SelectContent>
											</Select>
											<Button
												size="sm"
												variant="outline"
												disabled={!savedReplySelectedId || savedReplySelectedId === "__none"}
												onClick={insertSavedReply}
											>
												Insert
											</Button>
											<Button size="sm" variant="ghost" onClick={() => setShowSavedRepliesManager((v) => !v)}>
												{showSavedRepliesManager ? "Hide" : "Manage"}
											</Button>
										</>
									)}
								</div>

								{showSavedRepliesManager && savedRepliesStatus !== "upgrade" && (
									<Card className="p-3">
										<div className="space-y-3">
											<div className="space-y-2">
												<div className="grid gap-2">
													<Label className="text-xs">Title</Label>
													<Input
														value={newReplyTitle}
														onChange={(e) => setNewReplyTitle(e.target.value)}
														placeholder="e.g. Availability update"
														className="h-8"
													/>
												</div>
												<div className="grid gap-2">
													<Label className="text-xs">Message</Label>
													<textarea
														className="min-h-18 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
														value={newReplyBody}
														onChange={(e) => setNewReplyBody(e.target.value)}
														placeholder="Write the saved reply content…"
													/>
												</div>
												<div className="flex items-center justify-between">
													<p className="text-xs text-muted-foreground">Saved replies are visible only to you.</p>
													<Button
														size="sm"
														onClick={() => void createSavedReply()}
														disabled={isSavingReply || !newReplyTitle.trim() || !newReplyBody.trim()}
													>
														{isSavingReply ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
														Save
													</Button>
												</div>
											</div>

										{savedReplies.length > 0 && (
											<div className="space-y-2">
												<p className="text-xs font-medium">Your saved replies</p>
												<div className="space-y-2">
													{savedReplies.map((r) => (
														<div
															key={r.id}
															className="flex items-start justify-between gap-2 rounded-md border bg-muted/20 p-2"
														>
															<div className="min-w-0">
																<p className="truncate text-xs font-medium">{r.title}</p>
																<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.body}</p>
															</div>
															<Button size="sm" variant="ghost" onClick={() => void deleteSavedReply(r.id)}>
																Delete
															</Button>
														</div>
													))}
												</div>
											</div>
										)}
									</div>
								</Card>
							)}
						</div>
					)}
							<div className="flex items-end gap-2 rounded-xl border bg-muted/40 px-3 py-2">
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*"
									hidden
									onChange={handleAttachmentChange}
								/>
								<button
									type="button"
									className={cn(
										"rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
									)}
									title="Add attachment"
									disabled={!activeId || isSending || isUploadingAttachment}
									onClick={handleAttachmentClick}
								>
									{isUploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
								</button>

								<Popover>
									<PopoverTrigger asChild>
										<button
											type="button"
											className={cn(
												"rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
											)}
											title="Emoji"
											disabled={!activeId || isSending}
										>
											<Smile className="h-4 w-4" />
										</button>
									</PopoverTrigger>
									<PopoverContent align="start" className="w-64 p-2">
										<div className="grid grid-cols-8 gap-1">
											{EMOJI_SET.map((emoji) => (
												<button
													type="button"
													key={emoji}
													className="rounded-md p-1 text-lg hover:bg-muted"
													onClick={() => insertIntoComposer(emoji)}
												>
													{emoji}
												</button>
											))}
										</div>
									</PopoverContent>
								</Popover>

								<textarea
									ref={composerRef}
									className="max-h-32 min-h-11 flex-1 resize-none border-none bg-transparent text-sm shadow-none outline-none focus-visible:ring-0"
									placeholder="Type a message…"
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											void handleSendAction();
										}
									}}
									disabled={isSending || isUploadingAttachment}
								/>
								<Button
									size="sm"
									onClick={() => void handleSendAction()}
									disabled={isSending || isUploadingAttachment || !activeId || !draft.trim()}
								>
									{isSending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
									Send
								</Button>
							</div>
							{composerError && <p className="mt-2 text-xs text-red-500">{composerError}</p>}
							<p className="mt-1 text-[11px] text-muted-foreground">
								Messaging is limited to users with an active or completed booking.
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}


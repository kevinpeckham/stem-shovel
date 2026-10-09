/**
 * A chat's messages laid out for reading (docs/chat.md): a date line
 * where the day changes, a "New" line above the first message newer than
 * the reader's mark, and messages by one author within five minutes of
 * each other under one name-and-time header.
 */
export interface ChatLike {
	id: string;
	userId: string;
	authorName: string;
	createdAt: number;
}
export interface ChatRun<M extends ChatLike> {
	/** The run's first message's id, for keys. */
	id: string;
	userId: string;
	authorName: string;
	/** The run's first message's time (ms). */
	at: number;
	messages: M[];
}
export type ChatLine<M extends ChatLike> =
	| { kind: "date"; id: string; at: number }
	| { kind: "new"; id: string }
	| { kind: "run"; id: string; run: ChatRun<M> };

const CHAT_RUN_GAP_MS = 5 * 60 * 1000;

const dayKey = (ms: number) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * `readAt` is the reader's mark (ms) or null for never; `me` is the
 * reader's id, whose own messages never count as new.
 */
export function groupChat<M extends ChatLike>(
	messages: M[],
	readAt: number | null,
	me: string | null,
): ChatLine<M>[] {
	const lines: ChatLine<M>[] = [];
	let day = "";
	let run: ChatRun<M> | null = null;
	let newShown = false;
	for (const m of messages) {
		const key = dayKey(m.createdAt);
		const unread = !newShown && m.userId !== me && (readAt === null || m.createdAt > readAt);
		if (key !== day) {
			day = key;
			run = null;
			lines.push({ kind: "date", id: `date:${m.id}`, at: m.createdAt });
		}
		if (unread) {
			newShown = true;
			run = null;
			lines.push({ kind: "new", id: `new:${m.id}` });
		}
		const last = run?.messages.at(-1);
		if (run && last && run.userId === m.userId && m.createdAt - last.createdAt < CHAT_RUN_GAP_MS) {
			run.messages.push(m);
		} else {
			run = {
				id: m.id,
				userId: m.userId,
				authorName: m.authorName,
				at: m.createdAt,
				messages: [m],
			};
			lines.push({ kind: "run", id: `run:${m.id}`, run });
		}
	}
	return lines;
}

/** How many of the messages are new to the reader: others' messages past the mark. */
export function unreadCount(messages: ChatLike[], readAt: number | null, me: string | null) {
	return messages.filter((m) => m.userId !== me && (readAt === null || m.createdAt > readAt))
		.length;
}

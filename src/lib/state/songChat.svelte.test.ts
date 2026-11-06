import { describe, expect, test } from "vite-plus/test";
import type { ChatMessageRow } from "#lib/server/data.js";
import { SongChat } from "./songChat.svelte.js";

/** The song page's chat state: the panel, the messages and read mark, the unread count and a new song's reset. */
function message(id: string, userId: string, createdAt: number): ChatMessageRow {
	return {
		id,
		userId,
		authorName: userId,
		body: "Hi",
		createdAt,
		updatedAt: createdAt,
		editedAt: null,
		mentions: [],
		reactions: [],
	};
}

const messages = [message("m1", "u1", 100), message("m2", "u2", 200), message("m3", "u2", 300)];

describe("SongChat", () => {
	test("starts closed, with the loaded messages and read mark", () => {
		const chat = new SongChat({ messages, readAt: 150 }, () => "u1");
		expect(chat.open).toBe(false);
		expect(chat.messages).toHaveLength(3);
		expect(chat.readAt).toBe(150);
		chat.toggle();
		expect(chat.open).toBe(true);
		chat.toggle();
		expect(chat.open).toBe(false);
	});

	test("unread counts others' messages after the read mark", () => {
		const chat = new SongChat({ messages, readAt: 150 }, () => "u1");
		expect(chat.unread).toBe(2);
		chat.readAt = 250;
		expect(chat.unread).toBe(1);
		chat.readAt = 300;
		expect(chat.unread).toBe(0);
	});

	test("never read, every message by someone else is unread", () => {
		const chat = new SongChat({ messages, readAt: null }, () => "u2");
		expect(chat.unread).toBe(1);
	});

	test("no chat: nothing, and nothing unread", () => {
		const chat = new SongChat(null, () => null);
		expect(chat.messages).toEqual([]);
		expect(chat.readAt).toBeNull();
		expect(chat.unread).toBe(0);
	});

	test("reset takes the next song's chat and leaves the panel as it was", () => {
		const chat = new SongChat({ messages, readAt: 150 }, () => "u1");
		chat.open = true;
		chat.reset({ messages: [message("n1", "u3", 50)], readAt: null });
		expect(chat.messages.map((m) => m.id)).toEqual(["n1"]);
		expect(chat.readAt).toBeNull();
		expect(chat.unread).toBe(1);
		expect(chat.open).toBe(true);
		chat.reset(undefined);
		expect(chat.messages).toEqual([]);
		expect(chat.unread).toBe(0);
	});
});

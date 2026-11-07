import { render } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { ChatMessageRow } from "#lib/server/data.js";

/**
 * The Chat panel on the song page: hidden until opened, and the chat's
 * messages and read mark bound to the SongChat state. The chat itself is a
 * stand-in that keeps the props it was given.
 */
const h = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("#lib/components/SongChat.svelte", () => ({
	default: (_anchor: unknown, props: Record<string, unknown>) => {
		h.props = props;
	},
}));

const { default: SongChatPanel } = await import("./SongChatPanel.svelte");
const { SongChat } = await import("#lib/state/songChat.svelte.js");

const message: ChatMessageRow = {
	id: "m1",
	userId: "u2",
	authorName: "Mia",
	body: "Hi",
	createdAt: 100,
	updatedAt: 100,
	editedAt: null,
	mentions: [],
	reactions: [],
	attachments: [],
};

function setup(open: boolean) {
	const chat = new SongChat({ messages: [message], readAt: null }, () => "u1");
	chat.open = open;
	const onseek = vi.fn();
	const { container } = render(SongChatPanel, {
		chat,
		songId: "s1",
		me: { id: "u1", name: "Kevin" },
		isAdmin: false,
		canWrite: true,
		onseek,
	});
	return { chat, onseek, container };
}

describe("SongChatPanel", () => {
	test("closed, the wrapper is hidden; open, it shows", () => {
		expect((setup(false).container.firstElementChild as HTMLElement).className).toContain("hidden");
		expect((setup(true).container.firstElementChild as HTMLElement).className).not.toContain(
			"hidden",
		);
	});

	test("the chat gets the song, the person and the bound state", () => {
		const { chat, onseek } = setup(true);
		const props = h.props!;
		expect(props.songId).toBe("s1");
		expect(props.me).toEqual({ id: "u1", name: "Kevin" });
		expect(props.canWrite).toBe(true);
		expect(props.isAdmin).toBe(false);
		expect(props.onseek).toBe(onseek);
		expect(props.messages).toEqual([message]);
		expect(chat.unread).toBe(1);
		// The chat marks itself read: the state follows.
		props.readAt = 200;
		expect(chat.readAt).toBe(200);
		expect(chat.unread).toBe(0);
	});
});

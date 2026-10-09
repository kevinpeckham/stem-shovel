import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";

/**
 * The chat panel (docs/chat.md): the list grouped by day and author with
 * the "New" line, links and positions in a message, who gets Edit and
 * Delete, the composer (Enter sends, Shift+Enter does not), and the read
 * mark on opening. The remote functions are doubles; polling is off.
 */
const sendMessage = fakeRemoteForm();
const editMessage = fakeRemoteForm();
const deleteMessage = fakeRemoteForm();
const chatSince = vi.fn(async () => []);
const markChatRead = vi.fn(async () => ({ readAt: 9_000 }));
vi.mock("#lib/remote/chat.remote.js", () => ({
	sendMessage,
	editMessage,
	deleteMessage,
	chatSince,
	markChatRead,
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: SongChat } = await import("./SongChat.svelte");

beforeAll(() => {
	if (!("scrollIntoView" in Element.prototype))
		Object.assign(Element.prototype, { scrollIntoView() {} });
});
beforeEach(() => {
	vi.clearAllMocks();
});

const T0 = new Date(2026, 9, 9, 10, 0, 0).getTime();
const ME = { id: "me", name: "Pat" };
const msg = (id: string, userId: string, body: string, offset: number) => ({
	id,
	userId,
	authorName: userId === "me" ? "Pat" : "Sam",
	body,
	createdAt: T0 + offset,
	updatedAt: T0 + offset,
	editedAt: null as number | null,
});
const base = (over: Record<string, unknown> = {}) => ({
	songId: "V1StGXR8_Z5jdHi6B-myT",
	messages: [
		msg("a", "sam", "the drop at 1:23 is late, see https://example.com/x.", 0),
		msg("b", "sam", "and the bass", 60_000),
		msg("c", "me", "on it", 120_000),
	],
	readAt: T0 + 30_000,
	me: ME,
	canWrite: true,
	pollMs: 0,
	...over,
});

describe("SongChat", () => {
	test("groups by author, marks where the reader left off, and marks the chat read on opening", async () => {
		render(SongChat, { props: base() });
		const runs = document.querySelectorAll("[data-chat-run]");
		// Sam's two messages are a minute apart, but the New line between them breaks the run; Pat's is its own.
		expect(runs).toHaveLength(3);
		expect(within(runs[0] as HTMLElement).getByText("Sam")).toBeInTheDocument();
		expect(runs[0]).toHaveTextContent("the drop at");
		expect(runs[1]).toHaveTextContent("and the bass");
		expect(runs[2]).toHaveTextContent("Pat");
		// The New line sits above "and the bass" (past the mark), never above the reader's own.
		const sep = screen.getByRole("separator", { name: "New messages" });
		expect(sep.nextElementSibling).toHaveTextContent("and the bass");
		await vi.waitFor(() => expect(markChatRead).toHaveBeenCalledWith({ songId: base().songId }));
	});
	test("a position is a seek button and a URL a link in a new tab", async () => {
		const onseek = vi.fn();
		render(SongChat, { props: base({ onseek }) });
		await fireEvent.click(screen.getByRole("button", { name: "1:23" }));
		expect(onseek).toHaveBeenCalledWith(83);
		const link = screen.getByRole("link", { name: "https://example.com/x" });
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener");
	});
	test("Edit and Delete only on one's own messages; an admin may delete anyone's", () => {
		const { unmount } = render(SongChat, { props: base() });
		expect(screen.getAllByRole("button", { name: "Edit message" })).toHaveLength(1);
		expect(screen.getAllByRole("button", { name: "Delete message" })).toHaveLength(1);
		unmount();
		render(SongChat, { props: base({ isAdmin: true }) });
		expect(screen.getAllByRole("button", { name: "Edit message" })).toHaveLength(1);
		expect(screen.getAllByRole("button", { name: "Delete message" })).toHaveLength(3);
	});
	test("Enter sends the draft and Shift+Enter does not; an empty draft cannot be sent", async () => {
		render(SongChat, { props: base() });
		const box = screen.getByRole("textbox", { name: "Message" });
		expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
		await fireEvent.input(box, { target: { value: "sounds good" } });
		expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
		await fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
		expect(sendMessage.submit).not.toHaveBeenCalled();
		await fireEvent.keyDown(box, { key: "Enter" });
		await vi.waitFor(() => expect(sendMessage.submit).toHaveBeenCalledTimes(1));
	});
	test("Edit opens the message in a box with its text; Escape closes it", async () => {
		render(SongChat, { props: base() });
		await fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
		const box = screen.getByRole("textbox", { name: "Edit message" });
		expect(box).toHaveValue("on it");
		await fireEvent.keyDown(box, { key: "Escape" });
		expect(screen.queryByRole("textbox", { name: "Edit message" })).toBeNull();
	});
	test("someone who may not write sees the list without a composer; an empty chat says so", () => {
		const { unmount } = render(SongChat, { props: base({ canWrite: false, me: null }) });
		expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
		expect(screen.queryByRole("separator", { name: "New messages" })).not.toBeNull();
		unmount();
		render(SongChat, { props: base({ messages: [] }) });
		expect(screen.getByText("Nothing yet. Say something about this song.")).toBeInTheDocument();
		expect(markChatRead).not.toHaveBeenCalled();
	});
});

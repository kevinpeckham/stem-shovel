import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";

/**
 * The chat panel (docs/chat.md): the list grouped by day and author with
 * the "New" line, links and positions in a message, who gets Edit and
 * Delete, the composer (Enter sends, Shift+Enter does not), and the read
 * mark on opening, reactions (chips that toggle) and mentions (the `@`
 * picker, and a mention picked out in the text). The remote functions are
 * doubles; polling is off.
 */
const sendMessage = fakeRemoteForm();
const editMessage = fakeRemoteForm();
const deleteMessage = fakeRemoteForm();
const chatSince = vi.fn(async () => []);
const markChatRead = vi.fn(async () => ({ readAt: 9_000 }));
const reactToMessage = vi.fn();
const chatPeople = vi.fn(async () => [
	{ id: "sam", name: "Sam" },
	{ id: "sal", name: "Sally Ride" },
	{ id: "me", name: "Pat" },
]);
vi.mock("#lib/remote/chat.remote.js", () => ({
	sendMessage,
	editMessage,
	deleteMessage,
	chatSince,
	markChatRead,
	reactToMessage,
	chatPeople,
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
	mentions: [] as { id: string; name: string }[],
	reactions: [] as { emoji: "👍" | "🔥"; count: number; mine: boolean; names: string[] }[],
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
		await vi.waitFor(() =>
			expect(markChatRead).toHaveBeenCalledWith({ songId: base().songId, sessionId: "" }),
		);
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
	test("a reaction is a chip lit when it is the reader's; a tap toggles it and the row that comes back replaces the message", async () => {
		const a = msg("a", "sam", "louder?", 0);
		a.reactions = [{ emoji: "👍", count: 2, mine: true, names: ["Pat", "Sam"] }];
		reactToMessage.mockResolvedValueOnce({
			message: { ...a, reactions: [{ emoji: "👍", count: 1, mine: false, names: ["Sam"] }] },
		});
		render(SongChat, { props: base({ messages: [a] }) });
		const chip = screen.getByRole("button", { name: "👍 2: Pat, Sam" });
		expect(chip).toHaveAttribute("aria-pressed", "true");
		expect(chip).toHaveAttribute("title", "Pat, Sam");
		await fireEvent.click(chip);
		expect(reactToMessage).toHaveBeenCalledWith({ id: "a", emoji: "👍" });
		const after = await screen.findByRole("button", { name: "👍 1: Sam" });
		expect(after).toHaveAttribute("aria-pressed", "false");
	});
	test("the smiley offers the six emoji; someone who may not write sees chips but cannot tap them", async () => {
		const a = msg("a", "sam", "louder?", 0);
		a.reactions = [{ emoji: "🔥", count: 1, mine: false, names: ["Sam"] }];
		reactToMessage.mockResolvedValueOnce({ message: a });
		const { unmount } = render(SongChat, { props: base({ messages: [a] }) });
		expect(screen.getByRole("button", { name: "Add reaction" })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "React with 🎸", hidden: true }));
		expect(reactToMessage).toHaveBeenCalledWith({ id: "a", emoji: "🎸" });
		unmount();
		render(SongChat, { props: base({ messages: [a], canWrite: false, me: null }) });
		expect(screen.queryByRole("button", { name: "Add reaction" })).toBeNull();
		expect(screen.getByRole("button", { name: "🔥 1: Sam" })).toBeDisabled();
	});
	test("a mention of someone the message names stands out, the reader's own the more; other @text stays plain", () => {
		const a = msg("a", "sam", "@Pat and @Sally Ride, not @nobody", 0);
		a.mentions = [
			{ id: "me", name: "Pat" },
			{ id: "sal", name: "Sally Ride" },
		];
		render(SongChat, { props: base({ messages: [a] }) });
		const marks = document.querySelectorAll("[data-chat-mention]");
		expect([...marks].map((m) => m.textContent)).toEqual(["@Pat", "@Sally Ride"]);
		expect(marks[0]).toHaveAttribute("data-chat-mention", "me");
		expect(marks[1]).toHaveAttribute("data-chat-mention", "");
		expect(screen.getByText(/not @nobody/)).toBeInTheDocument();
	});
	test("@ opens the people picker, narrowed by what follows; arrows and Enter pick, writing @Name into the box", async () => {
		render(SongChat, { props: base() });
		const box = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
		box.value = "hey @sa";
		box.setSelectionRange(7, 7);
		await fireEvent.input(box);
		const list = await screen.findByRole("listbox", { name: "People to mention" });
		expect(chatPeople).toHaveBeenCalledWith({ songId: base().songId, sessionId: "" });
		expect(
			within(list)
				.getAllByRole("option")
				.map((o) => o.textContent?.trim()),
		).toEqual(["Sam", "Sally Ride"]);
		await fireEvent.keyDown(box, { key: "ArrowDown" });
		expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
		await fireEvent.keyDown(box, { key: "Enter" });
		// Enter picked rather than sent.
		expect(sendMessage.submit).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(box.value).toBe("hey @Sally Ride "));
		expect(screen.queryByRole("listbox")).toBeNull();
		// The picked person goes with the message as a mention.
		const hidden = document.querySelector('input[name="mentions[0]"]');
		expect(hidden).toHaveAttribute("value", "sal");
	});
});

import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The project page's chat feed (docs/chat.md, "The project page"): every
 * song's messages oldest first, each with its song's title linking to that
 * song's chat, the empty state, and "Load earlier messages" paging back.
 * The remote query is a double; polling is off.
 */
const projectChatFeed = vi.fn();
vi.mock("#lib/remote/projectChat.remote.js", () => ({ projectChatFeed }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: ProjectChatFeed } = await import("./ProjectChatFeed.svelte");

const T0 = new Date(2026, 9, 9, 10, 0, 0).getTime();
const msg = (id: string, songTitle: string, songSlug: string, offset: number) => ({
	id,
	songId: `song-${songSlug}`,
	songTitle,
	songSlug,
	userId: "sam",
	authorName: "Sam",
	body: `said ${id}`,
	createdAt: T0 + offset,
	editedAt: null as number | null,
});
const props = { projectId: "p1", account: "band", project: "album", me: { id: "me" }, pollMs: 0 };

beforeEach(() => {
	vi.clearAllMocks();
});

describe("ProjectChatFeed", () => {
	test("lists the newest page oldest first, each message under its song's link to that song's chat", async () => {
		projectChatFeed.mockResolvedValueOnce({
			messages: [
				{ ...msg("c", "Bridge", "bridge", 120_000), editedAt: T0 + 130_000 },
				msg("b", "Intro", "intro", 60_000),
				msg("a", "Bridge", "bridge", 0),
			],
			more: false,
		});
		render(ProjectChatFeed, { props });
		await vi.waitFor(() =>
			expect(document.querySelectorAll("[data-feed-message]")).toHaveLength(3),
		);
		expect(projectChatFeed).toHaveBeenCalledWith({ projectId: "p1" });
		const items = [...document.querySelectorAll<HTMLElement>("[data-feed-message]")];
		expect(
			items.map((li) => li.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim()),
		).toEqual(["said a", "said b", "said c (edited)"]);
		const link = within(items[1]).getByRole("link", { name: "Intro" });
		expect(link).toHaveAttribute("href", "/band/projects/album/intro?open=chat");
		expect(link).toHaveAttribute("title", "Open this song's chat");
		expect(screen.queryByRole("button", { name: "Load earlier messages" })).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.getByText("Reply on the song's chat.")).toBeInTheDocument();
	});
	test("an empty project says so", async () => {
		projectChatFeed.mockResolvedValueOnce({ messages: [], more: false });
		render(ProjectChatFeed, { props });
		expect(await screen.findByText("No messages yet on this project's songs.")).toBeInTheDocument();
	});
	test("Load earlier messages asks for the page before the oldest held and puts it on top", async () => {
		projectChatFeed
			.mockResolvedValueOnce({ messages: [msg("b", "Intro", "intro", 60_000)], more: true })
			.mockResolvedValueOnce({ messages: [msg("a", "Outro", "outro", 0)], more: false });
		render(ProjectChatFeed, { props });
		const button = await screen.findByRole("button", { name: "Load earlier messages" });
		await fireEvent.click(button);
		await vi.waitFor(() =>
			expect(document.querySelectorAll("[data-feed-message]")).toHaveLength(2),
		);
		expect(projectChatFeed).toHaveBeenLastCalledWith({ projectId: "p1", before: T0 + 60_000 });
		const items = document.querySelectorAll<HTMLElement>("[data-feed-message]");
		expect(within(items[0]).getByRole("link", { name: "Outro" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Load earlier messages" })).toBeNull();
	});
	test("a failed first load shows the error", async () => {
		projectChatFeed.mockRejectedValueOnce(new Error("Not found"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		render(ProjectChatFeed, { props });
		expect(await screen.findByText("Not found")).toBeInTheDocument();
	});
});

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { SongComments } from "#lib/state/songComments.svelte.js";

/**
 * The Comments panel on the song page: hidden until opened, Add for someone
 * who may comment, and each card's position, Edit and "edited" buttons
 * calling the engine, the comments state and the history. The delete
 * button (a remote form) is a stand-in; the panel is the real FloatingPanel.
 */
vi.mock("#lib/components/CommentDeleteButton.svelte", () => ({ default: () => {} }));

const { default: SongCommentsPanel } = await import("./SongCommentsPanel.svelte");

const list = [
	{
		id: "c1",
		userId: "u1",
		authorName: "Kevin",
		title: "Bridge",
		body: "Too loud",
		at: 12,
		createdAt: new Date("2026-10-01T12:00:00Z"),
		editedAt: new Date("2026-10-02T12:00:00Z"),
	},
	{
		id: "c2",
		userId: "u2",
		authorName: "Mia",
		title: "Intro",
		body: "Lovely",
		at: null,
		createdAt: new Date("2026-10-01T12:00:00Z"),
		editedAt: null,
	},
];

function setup({ open = true, canComment = true, rows = list } = {}) {
	const comments = {
		canEdit: (c: { userId: string }) => c.userId === "u1",
		canDelete: (c: { userId: string }) => c.userId === "u1",
		open: vi.fn(),
		edit: vi.fn(),
	};
	const engine = { seek: vi.fn() };
	const onhistory = vi.fn();
	const { container } = render(SongCommentsPanel, {
		open,
		comments: comments as unknown as SongComments,
		list: rows,
		canComment,
		engine: engine as unknown as StemEngine,
		showPos: (s: number) => `bar ${s}`,
		onhistory,
	});
	return { comments, engine, onhistory, container };
}

describe("SongCommentsPanel", () => {
	test("closed, the wrapper is hidden", () => {
		const { container } = setup({ open: false });
		expect((container.firstElementChild as HTMLElement).className).toContain("hidden");
	});

	test("no comments yet", () => {
		setup({ rows: [] });
		expect(screen.getByText("No comments yet.")).toBeTruthy();
	});

	test("Add a comment for someone who may comment, not for a visitor", async () => {
		const { comments } = setup();
		await fireEvent.click(screen.getByLabelText("Add a comment"));
		expect(comments.open).toHaveBeenCalledWith();
	});

	test("a visitor has no Add", () => {
		setup({ canComment: false });
		expect(screen.queryByLabelText("Add a comment")).toBeNull();
	});

	test("a card's position seeks, Edit edits, edited opens the history", async () => {
		const { comments, engine, onhistory } = setup();
		expect(screen.getByText("Bridge")).toBeTruthy();
		await fireEvent.click(screen.getByTitle("Go to this position"));
		expect(engine.seek).toHaveBeenCalledWith(12);
		expect(screen.getByText("bar 12")).toBeTruthy();
		await fireEvent.click(screen.getByText("Edit"));
		expect(comments.edit).toHaveBeenCalledWith(list[0]);
		await fireEvent.click(screen.getByText("edited"));
		expect(onhistory).toHaveBeenCalledWith({
			kind: "comment",
			commentId: "c1",
			label: "“Bridge”",
		});
		// Mia's comment: no position, not hers to edit.
		expect(screen.getAllByText("Edit")).toHaveLength(1);
		expect(screen.getAllByTitle("Go to this position")).toHaveLength(1);
	});
});

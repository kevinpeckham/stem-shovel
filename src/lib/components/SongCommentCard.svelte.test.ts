import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/** A comment card over a stand-in delete form that never submits. */
const forms = vi.hoisted(() => {
	const form = {
		enhance: () => ({}),
		pending: 0,
		fields: { id: { as: (type: string, value: string) => ({ name: "id", type, value }) } },
	};
	return { deleteComment: { for: () => form }, createComment: form, updateComment: form };
});
vi.mock("#lib/remote/comments.remote.js", () => forms);
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: SongCommentCard } = await import("./SongCommentCard.svelte");
const { SongComments } = await import("#lib/state/songComments.svelte.js");

const comment = {
	id: "c1",
	userId: "u1",
	title: "Bridge",
	body: "Too loud here",
	authorName: "Kevin",
	createdAt: new Date("2026-10-30T12:00:00Z"),
	editedAt: null,
	at: 12,
};

function setup(me: string | null) {
	const comments = new SongComments({
		user: () => (me ? { id: me } : null),
		memberships: () => [],
		accountId: () => "a1",
		readyDemos: () => [],
		editPos: (s) => `${s}`,
	});
	const onseek = vi.fn();
	const onedit = vi.fn();
	const props = {
		comment,
		comments,
		list: "timeline",
		pos: (s: number) => `bar ${s}`,
		onseek,
		onedit,
	};
	return { props, onseek, onedit };
}

describe("SongCommentCard", () => {
	test("the author's card: title, author and position, body, Go to, Edit and Delete", async () => {
		const { props, onseek, onedit } = setup("u1");
		render(SongCommentCard, { props });
		expect(screen.getByRole("heading", { name: "Bridge" })).toBeTruthy();
		expect(screen.getByText(/Kevin · Oct 30, 2026/)).toHaveTextContent("· bar 12");
		expect(screen.getByText("Too loud here")).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Go to" }));
		expect(onseek).toHaveBeenCalledWith(12);
		await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		expect(onedit).toHaveBeenCalledOnce();
		expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
	});

	test("another member's card has Go to but no Edit or Delete", () => {
		const { props } = setup("u2");
		render(SongCommentCard, { props });
		expect(screen.getByRole("button", { name: "Go to" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
	});

	test("an unplaced, edited comment: no position, no Go to, the edited mark", () => {
		const { props } = setup(null);
		render(SongCommentCard, {
			props: { ...props, comment: { ...comment, at: null, editedAt: new Date() } },
		});
		expect(screen.queryByRole("button", { name: "Go to" })).toBeNull();
		expect(screen.getByText(/Kevin · Oct 30, 2026/).textContent).not.toMatch(/bar/);
		expect(screen.getByText("edited")).toBeTruthy();
	});
});

import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The comment popover over stand-in forms: a field spreads its name and the
 * value it was given (as the remote form's `.as()` does), nothing submits.
 */
const forms = vi.hoisted(() => {
	const form = () => ({
		enhance: () => ({}),
		pending: 0,
		fields: new Proxy(
			{},
			{
				get: (_, name: string) => ({
					as: (type: string, value: string) =>
						type === "hidden" ? { name, type, value } : { name, value },
					issues: () => undefined,
					allIssues: () => undefined,
					set: () => {},
				}),
			},
		),
	});
	return { createComment: form(), updateComment: form() };
});
vi.mock("#lib/remote/comments.remote.js", () => forms);
// The placeholders come from songChanges, which imports the song remote functions.
vi.mock("#lib/remote/songs.remote.js", () => ({ saveChanges: {} }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: SongCommentPopover } = await import("./SongCommentPopover.svelte");
const { SongComments } = await import("#lib/state/songComments.svelte.js");

function setup() {
	const comments = new SongComments({
		user: () => ({ id: "u1" }),
		memberships: () => [],
		accountId: () => "a1",
		readyDemos: () => [{ id: "d1", label: "Kitchen take" }],
		editPos: (s) => `${s}`,
	});
	const props = {
		comments,
		songId: "song1",
		changes: { mode: "bars", editPos: (s: number) => `${s}` } as never,
		engine: null,
		demoPanel: null,
		onposted: () => {},
	};
	return { comments, props };
}

/** jsdom has no popover API: show the element as an open popover would be. */
function shown() {
	document.getElementById("song-comment")!.style.display = "block";
}

describe("SongCommentPopover", () => {
	test("a new comment: the title, the body and the position fields with the draft's values", () => {
		const { comments, props } = setup();
		comments.draft = { id: null, title: "Bridge", body: "Too loud", at: "12|3", demoId: "" };
		render(SongCommentPopover, { props });
		shown();
		expect(screen.getByRole("heading", { name: "Add a comment" })).toBeTruthy();
		expect(screen.getByLabelText("Title")).toHaveValue("Bridge");
		expect(screen.getByLabelText("Comment")).toHaveValue("Too loud");
		const position = screen.getByLabelText(/Position/);
		expect(position).toHaveValue("12|3");
		expect(position).toHaveAttribute("placeholder", "1|1");
		expect(screen.getByRole("button", { name: "Post comment" })).toBeTruthy();
	});

	test("an edit is titled so and saves", () => {
		const { comments, props } = setup();
		comments.draft = { id: "c1", title: "Bridge", body: "Too loud", at: "", demoId: "" };
		render(SongCommentPopover, { props });
		shown();
		expect(screen.getByRole("heading", { name: "Edit comment" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
	});

	test("the error line shows", () => {
		const { comments, props } = setup();
		comments.error = "Could not post it";
		render(SongCommentPopover, { props });
		shown();
		expect(screen.getByRole("alert")).toHaveTextContent("Could not post it");
	});

	test("a demo target shows its name and the position reads as time", () => {
		const { comments, props } = setup();
		comments.draft = { id: null, title: "", body: "", at: "", demoId: "d1" };
		render(SongCommentPopover, { props });
		shown();
		expect(screen.getByRole("heading", { name: /on demo "Kitchen take"/ })).toBeTruthy();
		expect(screen.getByLabelText(/Position/)).toHaveAttribute("placeholder", "0:00.0");
		// No demo panel yet: its Playhead cannot read a position.
		expect(screen.getByRole("button", { name: "Playhead" })).toBeDisabled();
	});
});

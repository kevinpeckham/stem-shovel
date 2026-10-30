import { fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

const { default: CommentCard } = await import("./CommentCard.svelte");

const comment = {
	title: "Bridge",
	body: "Too loud here",
	authorName: "Kevin",
	createdAt: new Date("2026-10-30T12:00:00Z"),
	editedAt: null,
	at: 12,
};

describe("CommentCard", () => {
	test("title, author, date and position, body; Go to and Edit call back", async () => {
		const onseek = vi.fn();
		const onedit = vi.fn();
		render(CommentCard, { props: { comment, pos: (s: number) => `0:${s}`, onseek, onedit } });
		expect(screen.getByRole("heading", { name: "Bridge" })).toBeTruthy();
		expect(screen.getByText(/Kevin · Oct 30, 2026/)).toHaveTextContent("· 0:12");
		expect(screen.getByText("Too loud here")).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Go to" }));
		expect(onseek).toHaveBeenCalledWith(12);
		await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		expect(onedit).toHaveBeenCalledOnce();
	});

	test("without the callbacks, no Go to and no Edit; the list's controls render after", () => {
		render(CommentCard, {
			props: {
				comment,
				pos: (s: number) => `${s}`,
				children: createRawSnippet(() => ({ render: () => "<button>Remove</button>" })),
			},
		});
		expect(screen.queryByRole("button", { name: "Go to" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
		expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
	});
});

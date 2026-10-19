import type { StudioCommentView } from "#lib/val/StudioSchema.js";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import StudioComments from "./StudioComments.svelte";

const comments = [
	{
		id: "k1",
		userId: "me",
		userName: "Kevin",
		body: "Louder here",
		at: 12.5,
		createdAt: new Date("2026-10-19T10:00:00Z"),
	},
	{
		id: "k2",
		userId: "them",
		userName: "Sam",
		body: "Nice take",
		at: null,
		createdAt: new Date("2026-10-19T11:00:00Z"),
	},
];

describe("StudioComments", () => {
	test("lists the thread with authors and pins; a pin jumps; delete shows where allowed", async () => {
		const user = userEvent.setup();
		const onjump = vi.fn();
		const ondelete = vi.fn();
		render(StudioComments, {
			props: {
				comments,
				position: 3,
				userId: "me",
				canDelete: (c: StudioCommentView) => c.userId === "me",
				onpost: vi.fn(),
				ondelete,
				onjump,
			},
		});
		const list = screen.getByRole("list", { name: "Comments" });
		expect(list).toHaveTextContent("Kevin");
		expect(list).toHaveTextContent("Louder here");
		expect(list).toHaveTextContent("Sam");
		await user.click(screen.getByRole("button", { name: "Go to 0:12.5" }));
		expect(onjump).toHaveBeenCalledWith(12.5);
		expect(screen.getByRole("button", { name: "Delete comment by Kevin" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Delete comment by Sam" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Delete comment by Kevin" }));
		expect(ondelete).toHaveBeenCalledWith("k1");
	});
	test("posts a comment pinned to the playhead, or unpinned, and clears the box", async () => {
		const user = userEvent.setup();
		const onpost = vi.fn();
		render(StudioComments, {
			props: {
				comments: [],
				position: 4.2504,
				userId: "me",
				canDelete: () => false,
				onpost,
				ondelete: vi.fn(),
				onjump: vi.fn(),
			},
		});
		expect(screen.getByText(/No comments yet/)).toBeInTheDocument();
		const box = screen.getByRole("textbox", { name: "Comment" });
		expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
		await user.type(box, "  Try a softer verse  ");
		await user.click(screen.getByRole("button", { name: "Post" }));
		expect(onpost).toHaveBeenLastCalledWith({ body: "Try a softer verse", at: 4.25 });
		expect(box).toHaveValue("");
		await user.click(screen.getByRole("checkbox", { name: /At the playhead/ }));
		await user.type(box, "General note");
		await user.keyboard("{Control>}{Enter}{/Control}");
		expect(onpost).toHaveBeenLastCalledWith({ body: "General note", at: null });
	});
});

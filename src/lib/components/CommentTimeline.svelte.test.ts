import { fakeEngine } from "../../../tests/helpers/fakeEngine";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import CommentTimeline from "./CommentTimeline.svelte";

const card = createRawSnippet((id: () => string) => ({
	render: () => `<p data-testid="card">comment ${id()}</p>`,
}));
const engine = () => fakeEngine({ duration: 100, mixPeaks: [0.1, 0.5, 0.9, 0.2] } as never);

describe("CommentTimeline", () => {
	test("a member with no comments yet is told how to leave one", () => {
		render(CommentTimeline, { props: { engine: engine(), comments: [], card, canComment: true } });
		expect(screen.getByText(/⌘-click/)).toBeInTheDocument();
		expect(screen.getByRole("group", { name: "Comments on the timeline" })).toBeInTheDocument();
	});
	test("a visitor sees no hint", () => {
		render(CommentTimeline, { props: { engine: engine(), comments: [], card } });
		expect(screen.queryByText(/⌘-click/)).toBeNull();
	});
	test("each located comment is an icon at its position; clicking opens its card and marks the spot", async () => {
		const user = userEvent.setup();
		render(CommentTimeline, {
			props: {
				engine: engine(),
				comments: [
					{ id: "c1", title: "Bridge dynamics", at: 25 },
					{ id: "c2", title: "Outro", at: 75 },
				],
				card,
			},
		});
		const icon = screen.getByRole("button", { name: "Comment: Bridge dynamics" });
		expect(icon.parentElement).toHaveStyle({ left: "25%" });
		expect(screen.queryByTestId("card")).toBeNull();
		await user.click(icon);
		expect(screen.getByTestId("card")).toHaveTextContent("comment c1");
		expect(icon).toHaveAttribute("aria-expanded", "true");
		await user.keyboard("{Escape}");
		expect(screen.queryByTestId("card")).toBeNull();
	});
	test("⌘-click, Ctrl-click and right-click on the row ask the page for its menu at that spot", async () => {
		const user = userEvent.setup();
		const oncontext = vi.fn();
		render(CommentTimeline, { props: { engine: engine(), comments: [], card, oncontext } });
		const row = screen.getByRole("slider", { name: "Mix position" });
		row.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 28 }) as DOMRect;
		await user.pointer({ target: row, coords: { clientX: 50, clientY: 10 }, keys: "[MouseLeft]" });
		expect(oncontext).not.toHaveBeenCalled(); // a plain click seeks
		await user.keyboard("{Meta>}");
		await user.pointer({ target: row, coords: { clientX: 50, clientY: 10 }, keys: "[MouseLeft]" });
		await user.keyboard("{/Meta}");
		expect(oncontext).toHaveBeenLastCalledWith(25, 50, 10); // a quarter of a 100 s mix
		await user.pointer({
			target: row,
			coords: { clientX: 150, clientY: 10 },
			keys: "[MouseRight]",
		});
		expect(oncontext).toHaveBeenLastCalledWith(75, 150, 10);
	});
});

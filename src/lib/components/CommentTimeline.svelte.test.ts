import { fakeEngine } from "../../../tests/helpers/fakeEngine";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet } from "svelte";
import { describe, expect, test } from "vite-plus/test";
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
});

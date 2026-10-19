import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import RecordingReview from "./RecordingReview.svelte";

const card = createRawSnippet((id: () => string) => ({
	render: () => `<p data-testid="card">comment ${id()}</p>`,
}));
const comments = [
	{ id: "c1", title: "Tempo drags", at: 30 },
	{ id: "c2", title: "Great solo", at: null },
];

describe("RecordingReview", () => {
	test("lists every comment through the page's card and bubbles the located ones on the waveform", () => {
		render(RecordingReview, {
			props: {
				label: "Take 3",
				peaks: [0.2, 0.8, 0.4],
				duration: 120,
				position: 10,
				comments,
				card,
				onseek: vi.fn(),
			},
		});
		expect(screen.getAllByTestId("card")).toHaveLength(2);
		expect(screen.getByRole("button", { name: "Comment: Tempo drags" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Comment: Great solo" })).toBeNull();
		expect(screen.getByRole("region", { name: "Comments on Take 3" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Comments (2)");
	});
	test("says the waveform is coming while the peaks are null, and how to comment when there are none", () => {
		render(RecordingReview, {
			props: {
				label: "Take 3",
				peaks: null,
				duration: 0,
				position: 0,
				comments: [],
				canComment: true,
				card,
				onseek: vi.fn(),
			},
		});
		expect(screen.getByText(/waveform is on its way/)).toBeInTheDocument();
		expect(screen.getByText(/No comments yet. ⌘-click/)).toBeInTheDocument();
	});
	test("the heading's button asks the page for a comment", async () => {
		const user = userEvent.setup();
		const oncomment = vi.fn();
		render(RecordingReview, {
			props: {
				label: "Take 3",
				peaks: [0.5],
				duration: 10,
				position: 0,
				comments: [],
				canComment: true,
				card,
				onseek: vi.fn(),
				oncomment,
			},
		});
		await user.click(screen.getByRole("button", { name: "Add comment on Take 3" }));
		expect(oncomment).toHaveBeenCalledOnce();
	});
});

import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, test } from "vite-plus/test";
import ChartScoreFile from "./ChartScoreFile.svelte";

/** A chart read from an uploaded score: the Score view is the file itself. */
const children = createRawSnippet(() => ({ render: () => "<p>the grid</p>" }));
const pdf = { id: "f1", kind: "pdf" as const, url: "https://blob/f1.pdf", name: "Lead sheet" };

describe("ChartScoreFile", () => {
	test("no file: the chart alone, whatever the view", () => {
		const { container } = render(ChartScoreFile, { file: null, view: "score", children });
		expect(screen.getByText("the grid")).toBeInTheDocument();
		expect(screen.queryByRole("radiogroup")).toBeNull();
		expect(container.querySelector("iframe")).toBeNull();
	});

	test("a PDF in the Score view: in a frame with its name and a link; Grid shows the read", async () => {
		const { container, rerender } = render(ChartScoreFile, { file: pdf, view: "score", children });
		expect(screen.queryByRole("radiogroup")).toBeNull();
		expect(screen.queryByText("the grid")).toBeNull();
		const frame = container.querySelector("iframe");
		expect(frame).toHaveAttribute("src", "https://blob/f1.pdf");
		expect(frame).toHaveAttribute("title", "Lead sheet");
		expect(screen.getByText("Lead sheet")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open in a new tab" })).toHaveAttribute(
			"href",
			"https://blob/f1.pdf",
		);
		await rerender({ view: "grid" });
		expect(screen.getByText("the grid")).toBeInTheDocument();
		expect(container.querySelector("iframe")).toBeNull();
	});

	test("an image: Score shows it as an image", async () => {
		const { container } = render(ChartScoreFile, {
			file: { ...pdf, kind: "image", url: "https://blob/f1.png" },
			view: "score",
			children,
		});
		expect(screen.getByRole("img", { name: "Lead sheet" })).toHaveAttribute(
			"src",
			"https://blob/f1.png",
		);
		expect(container.querySelector("iframe")).toBeNull();
	});
});

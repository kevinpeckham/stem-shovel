import { fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, test } from "vite-plus/test";
import ChartScoreFile from "./ChartScoreFile.svelte";

/** A chart read from an uploaded score: Grid / Score, the score being the file itself. */
const children = createRawSnippet(() => ({ render: () => "<p>the grid</p>" }));
const pdf = { id: "f1", kind: "pdf" as const, url: "https://blob/f1.pdf", name: "Lead sheet" };

describe("ChartScoreFile", () => {
	test("no file: the chart alone, no switch", () => {
		render(ChartScoreFile, { file: null, children });
		expect(screen.getByText("the grid")).toBeInTheDocument();
		expect(screen.queryByRole("radiogroup")).toBeNull();
	});

	test("a PDF: Grid first, Score shows it in a frame with its name and a link", async () => {
		const { container } = render(ChartScoreFile, { file: pdf, children });
		expect(screen.getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
		expect(screen.getByText("the grid")).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("radio", { name: "Score" }));
		expect(screen.getByRole("radio", { name: "Score" })).toHaveAttribute("aria-checked", "true");
		expect(screen.queryByText("the grid")).toBeNull();
		const frame = container.querySelector("iframe");
		expect(frame).toHaveAttribute("src", "https://blob/f1.pdf");
		expect(frame).toHaveAttribute("title", "Lead sheet");
		expect(screen.getByText("Lead sheet")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open in a new tab" })).toHaveAttribute(
			"href",
			"https://blob/f1.pdf",
		);
		await fireEvent.click(screen.getByRole("radio", { name: "Grid" }));
		expect(screen.getByText("the grid")).toBeInTheDocument();
	});

	test("an image: Score shows it as an image", async () => {
		const { container } = render(ChartScoreFile, {
			file: { ...pdf, kind: "image", url: "https://blob/f1.png" },
			children,
		});
		await fireEvent.click(screen.getByRole("radio", { name: "Score" }));
		expect(screen.getByRole("img", { name: "Lead sheet" })).toHaveAttribute(
			"src",
			"https://blob/f1.png",
		);
		expect(container.querySelector("iframe")).toBeNull();
	});
});

import { render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import MarkdownDocEditor from "./MarkdownDocEditor.svelte";

// woof-editor is loaded in onMount; a stand-in state class carries what the
// editor reads (the WYSIWYG component itself is never shown here).
vi.mock("@kevinpeckham/woof-editor", () => {
	class MarkdownEditorState {
		markdownCurrent: string;
		isSyncingFromWysiwyg = false;
		isReplayingHistory = false;
		hasEdits = false;
		canUndo = false;
		canRedo = false;
		constructor({ markdown }: { markdown: string }) {
			this.markdownCurrent = markdown;
		}
		pushHistory() {}
		reset() {}
		undo() {}
		redo() {}
		markAsSaved() {}
	}
	return { MarkdownEditorState, MarkdownEditor: () => {} };
});

const props = {
	markdown: "| C | G |\n\n## Chorus\n| F | C |",
	docKey: "song1/chart",
	label: "Chart",
	hint: "Chords and arrangement in barmark.",
	backHref: "/back",
	backLabel: "Song",
	version: 1,
	pending: false,
	confirmEmpty: false,
	saveError: null,
	onsave: () => {},
};

describe("MarkdownDocEditor", () => {
	test("a plain editor (a chart) offers no Rich Text choice and shows the source, even when asked for the rendered view", async () => {
		const { container } = render(MarkdownDocEditor, { ...props, plain: true, view: "rendered" });
		await vi.waitFor(() =>
			expect(container.querySelector("textarea:not([disabled])")).not.toBeNull(),
		);
		expect(screen.queryByRole("tab", { name: "Rich Text" })).toBeNull();
		expect(screen.queryByRole("tab", { name: "Markdown" })).toBeNull();
		expect(screen.queryByText("Rich Text")).toBeNull();
		expect(container.querySelector("textarea")?.value).toBe(props.markdown);
		expect(screen.getByText(props.hint)).toBeTruthy();
	});

	test("a plain embedded editor shows only the source pane", async () => {
		const { container } = render(MarkdownDocEditor, {
			...props,
			plain: true,
			mode: "embedded",
			view: "rendered",
		});
		await vi.waitFor(() =>
			expect(container.querySelector("textarea:not([disabled])")).not.toBeNull(),
		);
		expect(container.querySelector(".chart-editor")).toBeNull();
	});

	test("lyrics and notes keep the Rich Text / Markdown choice", () => {
		render(MarkdownDocEditor, { ...props, label: "Lyrics" });
		expect(screen.getByRole("tab", { name: "Rich Text" })).toBeTruthy();
		expect(screen.getByRole("tab", { name: "Markdown" })).toBeTruthy();
	});
});

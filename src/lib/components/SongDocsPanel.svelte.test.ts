import { fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet, flushSync } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The Docs panel over a real SongDocs: the document editor by tab, the
 * chart's source line, and the empty chart's three ways to fill it. The
 * editor is a stand-in that keeps its props; the panel is the real
 * FloatingPanel.
 */
const h = vi.hoisted(() => ({
	doc: null as Record<string, unknown> | null,
	write: vi.fn(),
}));
vi.mock("#lib/remote/songs.remote.js", () => ({ saveDoc: { pending: 0 } }));
vi.mock("#lib/components/SongDocPanel.svelte", () => ({
	default: (anchor: unknown, props: Record<string, unknown>) => {
		h.doc = props;
		// What the panel renders above the document, rendered here too.
		(props.above as ((anchor: unknown) => void) | undefined)?.(anchor);
		// An empty document's own content, handed the call that opens the editor.
		if (!props.html)
			(props.empty as ((anchor: unknown, write: () => () => void) => void) | undefined)?.(
				anchor,
				() => h.write,
			);
		return { close: async () => {} };
	},
}));

const { default: SongDocsPanel } = await import("./SongDocsPanel.svelte");
const { SongDocs } = await import("#lib/state/songDocs.svelte.js");

const html = { chart: "<p>chart</p>", lyrics: "<p>la</p>", notes: "" };
const above = createRawSnippet(() => ({ render: () => "<p>draft</p>" }));

function setup({
	noAi = false,
	docsHtml = html as Record<"chart" | "lyrics" | "notes", string>,
	canEdit = true,
	progress = null as string | null,
	chartSource = null as Record<string, unknown> | null,
	sourceGone = false,
	chartScoreNote = null as string | null,
	chartScoreFile = null as Record<string, unknown> | null,
} = {}) {
	h.doc = null;
	h.write.mockClear();
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
	const song = {
		id: "song1",
		changes: [{ kind: "tempo", start: 0, value: "120" }],
		chartMarkdown: "| C |",
		noAi,
		project: { noAi: false },
		chartSource: chartSource as never,
		chartScoreNote,
		chartScoreFile: chartScoreFile as never,
	};
	const docs = new SongDocs({
		song: () => ({
			...song,
			lyricsMarkdown: "la",
			notesMarkdown: "",
			chartVersion: 3,
			lyricsVersion: 1,
			notesVersion: 0,
		}),
		docs: () => docsHtml,
		myNote: () => null,
		signedIn: () => true,
		canEdit: () => true,
		aiAvailable: () => true,
		chordDraft: () => ({ draftBusy: false, chordBusy: null }) as never,
		engineStatus: () => null,
		hasGrid: () => false,
		onhistory: () => {},
	});
	docs.panel = "chart";
	const onGenerate = vi.fn();
	const oncancel = vi.fn();
	const onimport = vi.fn();
	const onreadagain = vi.fn();
	render(SongDocsPanel, {
		docs,
		song,
		docsHtml,
		canEdit,
		onGenerate,
		progress,
		oncancel,
		aiAvailable: true,
		busy: false,
		onimport,
		onreadagain,
		sourceGone,
		above,
	});
	return { docs, onGenerate, oncancel, onimport, onreadagain };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongDocsPanel", () => {
	test("the chart: its editor with the draft above, the defaults and the key's text", () => {
		setup();
		expect(screen.getByRole("tab", { name: "Chart" })).toHaveAttribute("aria-selected", "true");
		// One chart: no Chords / Engraving choice.
		expect(screen.queryByRole("radiogroup", { name: "Chart mode" })).toBeNull();
		expect(h.doc).toMatchObject({
			songId: "song1",
			kind: "chart",
			label: "Chart",
			markdown: "| C |",
			html: "<p>chart</p>",
			version: 3,
			canEdit: true,
			chartDefaults: { tempo: 120, meter: null },
		});
		expect(h.doc?.above).toBeTypeOf("function");
		expect(screen.getByText("draft")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Generate from the stems" })).toBeNull();
		expect(screen.queryByText(/^From |^Generated from/)).toBeNull();
	});

	test("an empty chart: Write it, Generate from the stems and Import from a score", async () => {
		const { onGenerate, onimport } = setup({ docsHtml: { ...html, chart: "" } });
		expect(h.doc?.empty).toBeTypeOf("function");
		await fireEvent.click(screen.getByRole("button", { name: "Write it" }));
		expect(h.write).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByRole("button", { name: "Generate from the stems" }));
		expect(onGenerate).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByRole("button", { name: "Import from a score" }));
		expect(onimport).toHaveBeenCalledOnce();
	});

	test("no Generate when the AI is off for the song", () => {
		setup({ docsHtml: { ...html, chart: "" }, noAi: true });
		expect(screen.queryByRole("button", { name: "Generate from the stems" })).toBeNull();
		expect(screen.getByRole("button", { name: "Import from a score" })).toBeInTheDocument();
	});

	test("while it runs: the step and Cancel", async () => {
		const { oncancel } = setup({ docsHtml: { ...html, chart: "" }, progress: "Saving…" });
		expect(screen.getByRole("status")).toHaveTextContent("Saving…");
		expect(screen.queryByRole("button", { name: "Generate from the stems" })).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(oncancel).toHaveBeenCalledOnce();
	});

	test("another document: no draft above", async () => {
		const { docs } = setup();
		await docs.show("lyrics");
		flushSync();
		expect(h.doc).toMatchObject({ kind: "lyrics", html: "<p>la</p>" });
		expect(h.doc?.above).toBeUndefined();
	});

	test("my notes: the user's own note, always editable", async () => {
		const { docs } = setup();
		await docs.show("notes");
		await docs.setNotesMine(true);
		flushSync();
		expect(h.doc).toMatchObject({ kind: "mynotes", label: "My notes", canEdit: true });
	});

	test("a chart from a score: the line names it and Read again uses it once more", async () => {
		const source = { kind: "notation", id: "n1", name: "Lead sheet", at: "2026-11-10T12:00:00Z" };
		const { onreadagain } = setup({ chartSource: source });
		expect(screen.getByText(/^From Lead sheet, read Nov 10, 2026/)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "Read again" }));
		expect(onreadagain).toHaveBeenCalledWith(source);
	});

	test("the file gone: the line says so, with no Read again", () => {
		const source = { kind: "file", id: "f1", name: "Scan", at: "2026-11-10T12:00:00Z" };
		setup({ chartSource: source, sourceGone: true });
		expect(screen.getByText(/the file is gone/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
	});

	test("a chart from the stems: the line, no Read again", () => {
		setup({ chartSource: { kind: "stems", at: "2026-11-10T12:00:00Z" } });
		expect(screen.getByText("Generated from the stems on Nov 10, 2026")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
	});

	test("a chart the score cannot draw: the reason, and how to fix it", () => {
		setup({ chartScoreNote: "Line 2: Qz7: a chord starts with a root A–G" });
		expect(
			screen.getByText(
				"The score can't be drawn: Line 2: Qz7: a chord starts with a root A–G. Fix it in the text and the score follows.",
			),
		).toBeInTheDocument();
	});

	test("no note without one, or without a chart", () => {
		setup();
		expect(screen.queryByText(/The score can't be drawn/)).toBeNull();
		setup({ chartScoreNote: "Line 1: x", docsHtml: { chart: "", lyrics: "", notes: "" } });
		expect(screen.queryByText(/The score can't be drawn/)).toBeNull();
	});

	test("a chart read from a PDF: the document is handed the file for its Score view", async () => {
		const file = { id: "f1", kind: "pdf", url: "https://blob/f1.pdf", name: "Lead sheet" };
		const { docs } = setup({ chartScoreFile: file });
		expect(h.doc?.scoreFile).toEqual(file);
		docs.panel = "lyrics";
		flushSync();
		expect(h.doc?.scoreFile).toBeNull();
	});
});

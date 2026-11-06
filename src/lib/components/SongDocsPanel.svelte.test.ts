import { render, screen } from "@testing-library/svelte";
import { createRawSnippet, flushSync } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The Docs panel over a real SongDocs: the document editor or the notation
 * panel by tab and mode. Both are stand-ins that keep their props; the panel
 * is the real FloatingPanel.
 */
const h = vi.hoisted(() => ({
	doc: null as Record<string, unknown> | null,
	notation: null as Record<string, unknown> | null,
}));
vi.mock("#lib/remote/songs.remote.js", () => ({ saveDoc: { pending: 0 } }));
vi.mock("#lib/components/SongDocPanel.svelte", () => ({
	default: (_anchor: unknown, props: Record<string, unknown>) => {
		h.doc = props;
		return { close: async () => {} };
	},
}));
vi.mock("#lib/components/SongNotationPanel.svelte", () => ({
	default: (_anchor: unknown, props: Record<string, unknown>) => {
		h.notation = props;
		return { pick: () => {} };
	},
}));

const { default: SongDocsPanel } = await import("./SongDocsPanel.svelte");
const { SongDocs } = await import("#lib/state/songDocs.svelte.js");

const html = { chart: "<p>chart</p>", lyrics: "<p>la</p>", notes: "" };
const above = createRawSnippet(() => ({ render: () => "<p>draft</p>" }));

function setup({ noAi = false } = {}) {
	h.doc = null;
	h.notation = null;
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
	const song = {
		id: "song1",
		title: "Letter Lands",
		notation: [],
		changes: [{ kind: "tempo", start: 0, value: "120" }],
		chartMarkdown: "| C |",
		noAi,
		project: { noAi: false },
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
		docs: () => html,
		myNote: () => null,
		signedIn: () => true,
		canEdit: () => true,
		aiAvailable: () => true,
		notationCount: () => 0,
		chordDraft: () => ({ draftBusy: false, chordBusy: null }) as never,
		engineStatus: () => null,
		hasGrid: () => false,
		onhistory: () => {},
	});
	docs.panel = "chart";
	const oncheck = vi.fn();
	render(SongDocsPanel, {
		docs,
		song,
		docsHtml: html,
		canEdit: true,
		aiAvailable: true,
		notationPdfs: [],
		notationCount: 0,
		busy: false,
		oncheck,
		above,
	});
	return { docs, oncheck };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongDocsPanel", () => {
	test("the chart: its editor with the draft above, the defaults and the key's text", () => {
		setup();
		expect(screen.getByRole("tab", { name: "Chart (1)" })).toHaveAttribute("aria-selected", "true");
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
		expect(h.doc?.above).toBe(above);
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

	test("the Chart's engraving: the notation panel, the AI off when the song turns it off", async () => {
		const { docs, oncheck } = setup({ noAi: true });
		await docs.setChartMode("notation");
		flushSync();
		expect(h.notation).toMatchObject({
			songId: "song1",
			songTitle: "Letter Lands",
			aiAvailable: false,
			oncheck,
		});
		expect(screen.getByLabelText("Upload notation")).toBeInTheDocument();
	});
});

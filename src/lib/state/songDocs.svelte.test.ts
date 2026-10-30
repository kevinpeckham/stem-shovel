import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

vi.mock("#lib/remote/songs.remote.js", () => ({ saveDoc: { pending: 0 } }));

const { SongDocs } = await import("./songDocs.svelte.js");

/** A localStorage stand-in, so the remembered choices can be read back. */
function stubStorage() {
	const store = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
	});
	return store;
}

const song = {
	id: "song1",
	chartMarkdown: "| C | G |",
	lyricsMarkdown: "",
	notesMarkdown: "",
	chartVersion: 2,
	lyricsVersion: 0,
	notesVersion: 0,
};

function setup({
	docs = { chart: "<p>chart</p>", lyrics: null, notes: null } as Record<
		"chart" | "lyrics" | "notes",
		string | null
	>,
	ai = true,
	canEdit = true,
	notationCount = 0,
	draftBusy = false,
} = {}) {
	const chordDraft = {
		draftBusy,
		chordBusy: null,
		cancelDraft: vi.fn(),
		draftFromPanel: vi.fn(async () => {}),
	};
	const onhistory = vi.fn();
	const d = new SongDocs({
		song: () => song,
		docs: () => docs,
		myNote: () => null,
		signedIn: () => true,
		canEdit: () => canEdit,
		aiAvailable: () => ai,
		notationCount: () => notationCount,
		chordDraft: () => chordDraft as never,
		engineStatus: () => "ready",
		hasGrid: () => true,
		onhistory,
	});
	return { d, chordDraft, onhistory };
}

type Item = { id?: string; action?: () => unknown };
const ids = (items: Item[]) => items.map((i) => i.id);
/** Run a menu item's action by its id. */
const run = (items: Item[], id: string) => items.find((i) => i.id === id)?.action?.();

beforeEach(() => {
	vi.unstubAllGlobals();
});

describe("SongDocs", () => {
	test("starts on the first document with content, lyrics first when both", () => {
		expect(setup().d.panel).toBe("chart");
		expect(setup({ docs: { chart: "<p>c</p>", lyrics: "<p>l</p>", notes: null } }).d.panel).toBe(
			"lyrics",
		);
		expect(setup({ docs: { chart: null, lyrics: null, notes: "<p>n</p>" } }).d.panel).toBe("notes");
		expect(setup({ docs: { chart: null, lyrics: null, notes: null } }).d.panel).toBe("lyrics");
	});

	test("toggleMono flips the kind and remembers the preference", () => {
		const store = stubStorage();
		const { d } = setup();
		d.toggleMono("chart");
		expect(d.mono.chart).toBe(true);
		expect(d.mono.lyrics).toBe(false);
		expect(JSON.parse(store.get("stemshovel.docMono") ?? "{}").chart).toBe(true);
		const again = setup().d;
		again.load();
		expect(again.mono.chart).toBe(true);
		d.toggleMono("chart");
		expect(d.mono.chart).toBe(false);
	});

	test("the ⋯ menu lists the shown document's items, the chart's draft only when the AI is available", async () => {
		const { d, chordDraft, onhistory } = setup();
		expect(ids(d.menuItems)).toEqual(["mono", "history", "ai", "draft"]);
		run(d.menuItems, "draft");
		expect(chordDraft.draftFromPanel).toHaveBeenCalled();
		run(d.menuItems, "history");
		expect(onhistory).toHaveBeenCalledWith({
			kind: "doc",
			songId: "song1",
			doc: "chart",
			label: "the chart",
			current: "| C | G |",
		});
		expect(ids(setup({ ai: false }).d.menuItems)).toEqual(["mono", "history"]);
		expect(ids(setup({ draftBusy: true }).d.menuItems)).toEqual([
			"mono",
			"history",
			"ai",
			"busy",
			"cancel",
		]);
		await d.show("lyrics");
		expect(ids(d.menuItems)).toEqual(["mono", "history"]);
	});

	test("setChartMode switches between text and notation, and the notation menu offers its upload", async () => {
		const store = stubStorage();
		const { d } = setup();
		expect(d.chartMode).toBe("text");
		await d.setChartMode("notation");
		expect(d.chartMode).toBe("notation");
		expect(d.notationShown).toBe(true);
		expect(store.get("stemshovel.song.chart-mode")).toBe("notation");
		expect(ids(d.menuItems)).toEqual(["upload-notation"]);
		await d.setChartMode("text");
		expect(d.chartMode).toBe("text");
		expect(d.notationShown).toBe(false);
	});

	test("the chart opens on notation when there is no chart text but there is notation", () => {
		const { d } = setup({ docs: { chart: null, lyrics: null, notes: null }, notationCount: 2 });
		expect(d.chartMode).toBe("notation");
		expect(d.tabLabel("chart")).toBe("Chart (2)");
		expect(d.tabLabel("lyrics")).toBe("Lyrics");
	});

	test("switching documents closes an open editor first", async () => {
		const { d } = setup();
		const close = vi.fn(async () => {});
		d.editor = { close } as never;
		d.editing = true;
		await d.show("notes");
		expect(close).toHaveBeenCalled();
		expect(d.editing).toBe(false);
		expect(d.panel).toBe("notes");
	});

	test("minimizing remembers the mode to come back to", async () => {
		stubStorage();
		const { d } = setup();
		await d.setMode("floating");
		d.toggle();
		await Promise.resolve();
		expect(d.mode).toBe("minimised");
		d.toggle();
		await Promise.resolve();
		expect(d.mode).toBe("floating");
	});
});

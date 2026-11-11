import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const remote = vi.hoisted(() => ({ setChartColumns: vi.fn(async (_input: unknown) => ({})) }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/remote/songs.remote.js", () => ({ saveDoc: { pending: 0 }, ...remote }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

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
	chartColumns: "shared" as "shared" | "row",
};

function setup({
	docs = { chart: "<p>chart</p>", lyrics: null, notes: null } as Record<
		"chart" | "lyrics" | "notes",
		string | null
	>,
	ai = true,
	canEdit = true,
	draftBusy = false,
	chartColumns = "shared" as "shared" | "row",
} = {}) {
	const chordDraft = {
		draftBusy,
		chordBusy: null,
		cancelDraft: vi.fn(),
		draftFromPanel: vi.fn(async () => {}),
		progress: null as string | null,
		generateChart: vi.fn(async () => {}),
	};
	const onhistory = vi.fn();
	const onsaved = vi.fn(async () => {});
	const d = new SongDocs({
		song: () => ({ ...song, chartColumns }),
		docs: () => docs,
		myNote: () => null,
		signedIn: () => true,
		canEdit: () => canEdit,
		aiAvailable: () => ai,
		chordDraft: () => chordDraft as never,
		engineStatus: () => "ready",
		hasGrid: () => true,
		onhistory,
		onsaved,
	});
	return { d, chordDraft, onhistory, onsaved };
}

type Item = { id?: string; action?: () => unknown };
const ids = (items: Item[]) => items.map((i) => i.id);
/** Run a menu item's action by its id. */
const run = (items: Item[], id: string) => items.find((i) => i.id === id)?.action?.();

beforeEach(() => {
	vi.unstubAllGlobals();
	remote.setChartColumns.mockReset().mockResolvedValue({});
	notify.mockReset();
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
		expect(ids(d.menuItems)).toEqual(["mono", "history", "columns", "ai", "draft"]);
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
		expect(ids(setup({ ai: false }).d.menuItems)).toEqual(["mono", "history", "columns"]);
		expect(ids(setup({ draftBusy: true }).d.menuItems)).toEqual([
			"mono",
			"history",
			"columns",
			"ai",
			"busy",
			"cancel",
		]);
		await d.show("lyrics");
		expect(ids(d.menuItems)).toEqual(["mono", "history"]);
	});

	test("Size columns per row: the chart's, to an editor only, checked when the chart sizes per row", async () => {
		const { d, onsaved } = setup();
		const item = () =>
			d.menuItems.find((i: { id?: string }) => i.id === "columns") as {
				label: string;
				iconClass: string;
			};
		expect(item()).toMatchObject({
			label: "Size columns per row",
			iconClass: "i-ph-check invisible",
		});
		await d.toggleChartColumns();
		expect(remote.setChartColumns).toHaveBeenCalledWith({ id: "song1", columns: "row" });
		expect(onsaved).toHaveBeenCalled();
		const row = setup({ chartColumns: "row" });
		expect(row.d.menuItems).toContainEqual(
			expect.objectContaining({ id: "columns", iconClass: "i-ph-check" }),
		);
		await row.d.toggleChartColumns();
		expect(remote.setChartColumns).toHaveBeenLastCalledWith({ id: "song1", columns: "shared" });
		expect(ids(setup({ canEdit: false }).d.menuItems)).not.toContain("columns");
		await d.show("lyrics");
		expect(ids(d.menuItems)).not.toContain("columns");
	});

	test("a failed column save is an error notification, and the page is not refreshed", async () => {
		const { d, onsaved } = setup();
		remote.setChartColumns.mockRejectedValue(new Error("Song not found"));
		run(d.menuItems, "columns");
		await vi.waitFor(() =>
			expect(notify).toHaveBeenCalledWith("Song not found", { kind: "error" }),
		);
		expect(onsaved).not.toHaveBeenCalled();
	});

	test("Generate chart from the stems is offered only on an empty chart", () => {
		const empty = setup({ docs: { chart: null, lyrics: null, notes: null } });
		empty.d.panel = "chart";
		expect(ids(empty.d.menuItems)).toEqual([
			"mono",
			"history",
			"columns",
			"ai",
			"draft",
			"generate",
		]);
		run(empty.d.menuItems, "generate");
		expect(empty.chordDraft.generateChart).toHaveBeenCalled();
		expect(ids(setup().d.menuItems)).not.toContain("generate");
		const running = setup({ docs: { chart: null, lyrics: null, notes: null } });
		running.d.panel = "chart";
		running.chordDraft.progress = "Saving…";
		expect(running.d.menuItems).toContainEqual(
			expect.objectContaining({ id: "busy", notice: "Saving…" }),
		);
	});

	test("setChordDialect spells chords as names, Nashville or Roman, and is remembered", () => {
		const store = stubStorage();
		const { d } = setup();
		expect(d.chordDialect).toBe("names");
		expect(d.numerals).toBeNull();
		d.setChordDialect("roman");
		expect(d.numerals).toBe("roman");
		expect(store.get("stemshovel.song.chord-dialect")).toBe("roman");
		const again = setup().d;
		again.load();
		expect(again.chordDialect).toBe("roman");
		expect(d.chordDialectShort).toBe("Roman");
		expect(ids(d.chordDialectItems)).toEqual(["names", "nashville", "roman"]);
		expect(d.chordDialectItems.map((i: { iconClass?: string | null }) => i.iconClass)).toEqual([
			"i-ph-check invisible",
			"i-ph-check invisible",
			"i-ph-check",
		]);
		run(d.chordDialectItems, "nashville");
		expect(d.numerals).toBe("nashville");
		expect(d.chordDialectShort).toBe("Nashville");
	});

	test("load ignores a remembered chord spelling it does not know", () => {
		const store = stubStorage();
		store.set("stemshovel.song.chord-dialect", "solfege");
		const { d } = setup();
		d.load();
		expect(d.chordDialect).toBe("names");
	});

	test("the chart is one document: no notation mode, its tab plain, its menu the chart's", () => {
		const { d } = setup({ docs: { chart: null, lyrics: null, notes: null } });
		d.panel = "chart";
		expect(ids(d.menuItems)).toEqual(["mono", "history", "columns", "ai", "draft", "generate"]);
		expect(d).not.toHaveProperty("chartMode");
	});

	test("showChart brings a minimized panel back on the Chart tab", async () => {
		stubStorage();
		const { d } = setup({ docs: { chart: null, lyrics: "<p>l</p>", notes: null } });
		await d.setMode("floating");
		await d.setMode("minimised");
		expect(d.panel).toBe("lyrics");
		await d.showChart();
		expect(d.mode).toBe("floating");
		expect(d.panel).toBe("chart");
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

import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The AI's draft card: Save sections (the bars as seconds on the grid), Save
 * as chart, and Discard. The remote functions and the notifications are
 * recorded; the chart's HTML is a stand-in.
 */
const h = vi.hoisted(() => ({
	saveSections: vi.fn(async () => {}),
	saveChartDraft: vi.fn(async () => {}),
	chartFromScore: vi.fn(),
	notify: vi.fn(),
}));
vi.mock("#lib/remote/files.remote.js", () => ({ chartFromScore: h.chartFromScore }));
vi.mock("#lib/remote/songs.remote.js", () => ({
	saveSections: h.saveSections,
	saveChartDraft: h.saveChartDraft,
	draftChart: vi.fn(),
	reconcileChords: vi.fn(),
	songNotes: vi.fn(),
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/components/ChartHtml.svelte", () => ({ default: () => {} }));

const { default: SongDraftCard } = await import("./SongDraftCard.svelte");
const { default: SongDraftInPanel } = await import("./SongDraftInPanel.svelte");
const { SongChordDraft } = await import("#lib/state/songChordDraft.svelte.js");

const draft = () => ({
	chords: "D5 % A5 G5 D5",
	sections: [
		{ name: "Verse", bar: 1 },
		{ name: "Chorus", bar: 3 },
	],
	progressions: [{ section: "Verse", chords: "D5 A5" }],
	notes: "Loud guitars",
	chart: "## Verse\n| D5 | A5 |",
	chartHtml: "<p>chart</p>",
});
/** 120 bpm in 4/4: a bar is two seconds. */
const grid = {
	tempos: [{ start: 0, bpm: 120 }],
	meters: [{ start: 0, beatsPerBar: 4 }],
	startAt: 0,
};

/** A score's chart, as `chartDraftOfScore` builds it. */
const scoreDraft = () => ({
	chords: "",
	sections: [],
	progressions: [],
	notes: "",
	chart: "key: C\n| C | G |",
	chartHtml: "<p>chart</p>",
	source: "score" as const,
	scoreName: "Lead sheet",
	diagnostics: [
		{ level: "error" as const, message: "The piano part's notes were left out." },
		{ level: "warning" as const, message: "A rhythm snapped in measure 2." },
	],
});

/** A score without chord symbols: an empty chart, the importer's error and the parts it names. */
const partsDraft = () => ({
	...scoreDraft(),
	chart: "",
	chartHtml: "",
	diagnostics: [
		{ level: "error" as const, message: "no chord symbols; these parts have notes: Piano, Bass." },
	],
	notationId: "score-1",
	parts: ["Piano", "Bass"],
});

function setup({
	hasSections = false,
	hasChart = false,
	confirmed = true,
	value = draft() as
		| ReturnType<typeof draft>
		| ReturnType<typeof scoreDraft>
		| ReturnType<typeof partsDraft>,
} = {}) {
	vi.stubGlobal(
		"confirm",
		vi.fn(() => confirmed),
	);
	const chordDraft = new SongChordDraft({
		songId: () => "song1",
		engine: () => null,
		grid: () => grid,
		aiAvailable: () => true,
		startAt: () => null,
		ensureGrid: async () => true,
		onsaved: async () => {},
		hasSections: () => false,
	});
	chordDraft.draft = value;
	const onsectionssaved = vi.fn();
	const onchartsaved = vi.fn();
	const props = {
		chordDraft,
		songId: "song1",
		grid,
		hasSections,
		hasChart,
		onsectionssaved,
		onchartsaved,
	};
	render(SongDraftCard, props);
	return { chordDraft, onsectionssaved, onchartsaved };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("SongDraftCard", () => {
	test("the draft: chords by bar in lines of four, the sections and the progressions", () => {
		setup();
		expect(screen.getByText("AI draft")).toBeInTheDocument();
		expect(screen.getByText("| D5 | % | A5 | G5 |", { exact: false })).toBeInTheDocument();
		expect(screen.getByText("Verse @ bar 1 · Chorus @ bar 3")).toBeInTheDocument();
		expect(screen.getByText("Loud guitars")).toBeInTheDocument();
	});

	test("Save sections: the bars as seconds, then the page's refresh", async () => {
		const { onsectionssaved } = setup();
		await fireEvent.click(screen.getByRole("button", { name: "Save sections" }));
		await vi.waitFor(() => expect(onsectionssaved).toHaveBeenCalled());
		expect(h.saveSections).toHaveBeenCalledWith({
			id: "song1",
			sections: [
				{ name: "Verse", start: 0 },
				{ name: "Chorus", start: 4 },
			],
		});
		expect(confirm).not.toHaveBeenCalled();
		expect(h.notify).toHaveBeenCalledWith("Sections saved from the draft");
	});

	test("replacing sections asks first; declined, nothing is saved", async () => {
		setup({ hasSections: true, confirmed: false });
		await fireEvent.click(screen.getByRole("button", { name: "Save sections" }));
		expect(confirm).toHaveBeenCalledWith("Replace the song's sections with the drafted ones?");
		expect(h.saveSections).not.toHaveBeenCalled();
	});

	test("Save as chart replaces an existing chart once confirmed", async () => {
		const { onchartsaved } = setup({ hasChart: true });
		await fireEvent.click(screen.getByRole("button", { name: "Save as chart" }));
		await vi.waitFor(() => expect(onchartsaved).toHaveBeenCalled());
		expect(confirm).toHaveBeenCalledWith("Replace the song's chart with the drafted one?");
		expect(h.saveChartDraft).toHaveBeenCalledWith({
			id: "song1",
			markdown: "## Verse\n| D5 | A5 |",
			replace: true,
		});
		expect(h.notify).toHaveBeenCalledWith("Chart saved from the draft");
	});

	test("a failed save is an error notification", async () => {
		h.saveChartDraft.mockRejectedValueOnce(new Error("Nope"));
		const { onchartsaved } = setup();
		await fireEvent.click(screen.getByRole("button", { name: "Save as chart" }));
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Nope", { kind: "error" }));
		expect(onchartsaved).not.toHaveBeenCalled();
	});

	test("a save in flight: its button reads Saving… and both save buttons wait", async () => {
		let done: () => void = () => {};
		h.saveChartDraft.mockReturnValueOnce(new Promise<void>((resolve) => (done = resolve)));
		setup();
		await fireEvent.click(screen.getByRole("button", { name: "Save as chart" }));
		expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Save sections" })).toBeDisabled();
		done();
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Chart saved from the draft"));
	});

	test("after Save as chart the card goes, like Discard", async () => {
		const { chordDraft, onchartsaved } = setup();
		await fireEvent.click(screen.getByRole("button", { name: "Save as chart" }));
		await vi.waitFor(() => expect(onchartsaved).toHaveBeenCalled());
		await vi.waitFor(() => expect(screen.queryByText("AI draft")).toBeNull());
		expect(chordDraft.draft).toBeNull();
	});

	test("after Save sections the card stays and its button reads Sections saved, until a new draft", async () => {
		const { chordDraft } = setup();
		await fireEvent.click(screen.getByRole("button", { name: "Save sections" }));
		await vi.waitFor(() =>
			expect(screen.getByRole("button", { name: "Sections saved" })).toBeDisabled(),
		);
		expect(screen.getByText("AI draft")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save as chart" })).toBeEnabled();
		chordDraft.draft = draft();
		await vi.waitFor(() =>
			expect(screen.getByRole("button", { name: "Save sections" })).toBeEnabled(),
		);
	});

	test("Discard clears the draft", async () => {
		const { chordDraft } = setup();
		await fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		expect(chordDraft.draft).toBeNull();
		expect(screen.queryByText("AI draft")).toBeNull();
	});
});

describe("SongDraftCard with a score's chart", () => {
	test("the heading names the score; its diagnostics are listed, errors and warnings apart", () => {
		setup({ value: scoreDraft() });
		expect(screen.getByText("Chart from Lead sheet")).toBeInTheDocument();
		expect(screen.queryByText("AI draft")).toBeNull();
		const error = screen.getByText("The piano part's notes were left out.");
		const warning = screen.getByText("A rhythm snapped in measure 2.");
		expect(error.tagName).toBe("LI");
		expect(error).toHaveClass("text-red-400");
		expect(warning).toHaveClass("text-amber-300");
	});

	test("no Save sections, and no empty sections, progressions or chords by bar", () => {
		setup({ value: scoreDraft() });
		expect(screen.queryByRole("button", { name: "Save sections" })).toBeNull();
		expect(screen.queryByText("Chords by bar")).toBeNull();
		expect(screen.queryByText("@ bar", { exact: false })).toBeNull();
	});

	test("Save as chart saves the score's chart", async () => {
		const { onchartsaved } = setup({ value: scoreDraft() });
		await fireEvent.click(screen.getByRole("button", { name: "Save as chart" }));
		await vi.waitFor(() => expect(onchartsaved).toHaveBeenCalled());
		expect(h.saveChartDraft).toHaveBeenCalledWith({
			id: "song1",
			markdown: "key: C\n| C | G |",
			replace: false,
		});
	});

	test("an AI draft has no diagnostics list", () => {
		setup();
		expect(screen.getByText("AI draft")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save sections" })).toBeInTheDocument();
		expect(document.querySelector(".text-amber-300, .text-red-400")).toBeNull();
	});
});

describe("SongDraftCard with a chart built from the detected chords", () => {
	const timing = {
		format: "barmark-timing",
		version: 1,
		chart: { bars: 2, hash: "0123456789abcdef" },
		bars: [
			{ bar: 1, start: 0 },
			{ bar: 2, start: 2 },
		],
		end: 4,
	};
	const confidence = {
		format: "barmark-confidence",
		version: 1,
		bars: [
			{ bar: 1, confidence: 1, slots: [1] },
			{ bar: 2, confidence: 0.5, slots: [0.5] },
		],
	};
	const built = () => ({
		...draft(),
		source: "built" as const,
		diagnostics: [{ level: "warning" as const, message: "The meter was assumed 4/4." }],
		timing,
		confidence,
	});

	test("the heading says so and the builder's warnings are listed", () => {
		setup({ value: built() as never });
		expect(screen.getByText("Draft from the detected chords")).toBeInTheDocument();
		expect(screen.getByText("The meter was assumed 4/4.")).toHaveClass("text-amber-300");
	});

	test("Save as chart sends the timing map and the confidence beside the chart", async () => {
		const { onchartsaved } = setup({ value: built() as never });
		await fireEvent.click(screen.getByRole("button", { name: "Save as chart" }));
		await vi.waitFor(() => expect(onchartsaved).toHaveBeenCalled());
		expect(h.saveChartDraft).toHaveBeenCalledWith({
			id: "song1",
			markdown: "## Verse\n| D5 | A5 |",
			replace: false,
			timing,
			confidence,
		});
	});
});

describe("SongDraftCard with a score without chord symbols", () => {
	const SENTENCE = "No chord symbols in this score. Chart a part's notes instead:";

	test("offers a button per part, and no Save as chart", () => {
		setup({ value: partsDraft() });
		expect(screen.getByText("Chart from Lead sheet")).toBeInTheDocument();
		expect(screen.getByText(SENTENCE)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Piano" })).toHaveClass("button", "button-xs");
		expect(screen.getByRole("button", { name: "Bass" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save as chart" })).toBeNull();
		expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
	});

	test("a part's button charts its notes: the card shows the chart with the part in the heading", async () => {
		let answer: (value: unknown) => void = () => {};
		h.chartFromScore.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const { chordDraft } = setup({ value: partsDraft() });
		await fireEvent.click(screen.getByRole("button", { name: "Piano" }));
		expect(h.chartFromScore).toHaveBeenCalledWith({ id: "score-1", part: "Piano" });
		await vi.waitFor(() => expect(screen.getByRole("button", { name: "Bass" })).toBeDisabled());
		answer({
			chart: "| {C4 E4 G4} | {G3 B3 D4} |",
			chartHtml: "<p>notes</p>",
			diagnostics: [],
			parts: [],
			partName: "Piano",
		});
		await vi.waitFor(() =>
			expect(screen.getByText("Chart from Lead sheet, the Piano part")).toBeInTheDocument(),
		);
		expect(screen.queryByText(SENTENCE)).toBeNull();
		expect(screen.getByRole("button", { name: "Save as chart" })).toBeInTheDocument();
		expect(chordDraft.draft).toMatchObject({
			chart: "| {C4 E4 G4} | {G3 B3 D4} |",
			notationId: "score-1",
			partName: "Piano",
		});
	});

	test("a failed call is an error notification and the parts stay", async () => {
		h.chartFromScore.mockRejectedValue(new Error("The score could not be read"));
		setup({ value: partsDraft() });
		await fireEvent.click(screen.getByRole("button", { name: "Bass" }));
		await vi.waitFor(() =>
			expect(h.notify).toHaveBeenCalledWith("The score could not be read", { kind: "error" }),
		);
		expect(screen.getByRole("button", { name: "Bass" })).toBeEnabled();
		expect(screen.getByText(SENTENCE)).toBeInTheDocument();
	});
});

describe("SongDraftInPanel", () => {
	const base = {
		songId: "song1",
		grid,
		hasSections: false,
		hasChart: false,
		onsectionssaved: () => {},
		onchartsaved: () => {},
	};

	test("the detection's error, and no card without a draft", () => {
		render(SongDraftInPanel, {
			...base,
			chordDraft: { draft: null, chordError: "No stems decoded" } as never,
		});
		expect(screen.getByRole("alert")).toHaveTextContent("No stems decoded");
		expect(screen.queryByText("AI draft")).toBeNull();
	});

	test("the draft card under a draft", () => {
		render(SongDraftInPanel, {
			...base,
			chordDraft: { draft: draft(), chordError: null } as never,
		});
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.getByText("AI draft")).toBeInTheDocument();
	});
});

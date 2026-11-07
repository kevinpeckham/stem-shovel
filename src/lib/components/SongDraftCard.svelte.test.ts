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
	notify: vi.fn(),
}));
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

function setup({
	hasSections = false,
	hasChart = false,
	confirmed = true,
	value = draft() as ReturnType<typeof draft> | ReturnType<typeof scoreDraft>,
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

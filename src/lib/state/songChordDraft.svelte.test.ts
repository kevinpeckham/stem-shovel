import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Note } from "#lib/audio/chords.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { barGrid } from "#lib/audio/measures.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";

/**
 * Detect chords and the AI's draft: the chord model's state, the server's
 * notes, the AI's check and its draft are stand-ins (the notes cover the
 * song, so nothing is transcribed here); notifications are recorded.
 */
const remote = vi.hoisted(() => ({
	songChords: vi.fn(),
	songNotes: vi.fn(),
	reconcileChords: vi.fn(),
	draftChart: vi.fn(),
	useChartlessGrid: vi.fn(),
	saveSections: vi.fn(),
	saveChartDraft: vi.fn(),
}));
vi.mock("#lib/remote/songs.remote.js", () => remote);
const files = vi.hoisted(() => ({ chartFromScore: vi.fn() }));
vi.mock("#lib/remote/files.remote.js", () => files);
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));
/** The chartless placement on the stems: unavailable (the declared grid stands) unless a test says otherwise. */
const placing = vi.hoisted(() => ({ chartlessGridInBrowser: vi.fn() }));
vi.mock("#lib/audio/chartlessGridInBrowser.js", () => placing);

const { SongChordDraft } = await import("./songChordDraft.svelte");

/** D for two bars, A, G: four bars of 2 s at 120 bpm in 4/4. */
const note = (bar: number, bars: number, pitch: number): Note => ({
	start: bar * 2,
	end: (bar + bars) * 2,
	pitch,
	amplitude: 0.8,
});
const NOTES = [
	...[50, 62, 66, 69].map((p) => note(0, 2, p)),
	...[45, 57, 61, 64].map((p) => note(2, 1, p)),
	...[43, 55, 59, 62].map((p) => note(3, 1, p)),
];
const GRID = barGrid(
	[
		{ kind: "tempo", start: 0, value: "120" },
		{ kind: "meter", start: 0, value: "4/4" },
	],
	null,
);
const decodedBuffers = vi.fn();
const engine = {
	status: "ready",
	duration: 7.9,
	decodedBuffers,
	sourceUrls: () => ["https://blob.example/accounts/a/songs/s/st.play-1.m4a"],
} as unknown as StemEngine;
const BUFFER = { sampleRate: 44100 } as AudioBuffer;

const ensureGrid = vi.fn(async () => true);
const onsaved = vi.fn(async () => {});

function make({
	ai = true,
	grid = GRID as typeof GRID | null,
	startAt = null as number | null,
	hasSections = false,
	/** A grid that changes during the run (the stems' scan sets it); else `grid`. */
	gridOf = undefined as (() => typeof GRID | null) | undefined,
} = {}) {
	return new SongChordDraft({
		songId: () => "song1",
		engine: () => engine,
		grid: gridOf ?? (() => grid),
		aiAvailable: () => ai,
		startAt: () => startAt,
		ensureGrid,
		onsaved,
		hasSections: () => hasSections,
	});
}

const DRAFT = {
	sections: [{ name: "Verse", bar: 1 }],
	progressions: [{ section: "Verse", chords: "D A G" }],
	chords: "D % A G",
	chart: "## Verse",
	notes: "",
	chartHtml: "<h2>Verse</h2>",
};

/** A remote query's stand-in: awaitable, with the `refresh` each poll calls. */
const asQuery = (value: unknown) =>
	Object.assign(Promise.resolve(value), { refresh: () => Promise.resolve() });
const NO_MIX = { chords: null, inFlight: false, hasMix: false };
const RUNNING = { chords: null, inFlight: true, hasMix: true };

/** The model's frames: two bars of D, then A and G (a frame is 0.5 s, so a bar of 2 s is four). */
const MODEL: ChordminiRuns = {
	version: "v1",
	frameSec: 0.5,
	frames: 16,
	runs: [
		{ start: 0, end: 8, chord: "D", label: "D" },
		{ start: 8, end: 12, chord: "A", label: "A" },
		{ start: 12, end: 16, chord: "G", label: "G" },
	],
};
const STORED = { chords: MODEL, inFlight: false, hasMix: true };
const UNAVAILABLE = { ok: false, reason: "unavailable", witnesses: [] };
/** The placement's answer for a placed grid. */
const placedAs = (grid: object) => ({ ok: true, grid });
const WITNESS = { name: "timeZero", cls: null, weight: 2, detail: {} };

beforeEach(() => {
	vi.clearAllMocks();
	remote.songChords.mockImplementation(() => asQuery(NO_MIX));
	remote.songNotes.mockResolvedValue({ complete: true, notes: NOTES, doneSeconds: 8, duration: 8 });
	remote.reconcileChords.mockResolvedValue({ chords: ["D", "D", "A", "Em"] });
	remote.draftChart.mockResolvedValue(DRAFT);
	decodedBuffers.mockResolvedValue([BUFFER]);
	placing.chartlessGridInBrowser.mockResolvedValue(UNAVAILABLE);
	remote.useChartlessGrid.mockImplementation(async (input: object) => input);
	remote.saveSections.mockResolvedValue(undefined);
	remote.saveChartDraft.mockResolvedValue(undefined);
});

describe("SongChordDraft", () => {
	test("detect reads a chord per bar from the server's notes, then the AI checks them", async () => {
		const cd = make();
		await cd.detectChords();
		expect(remote.reconcileChords).toHaveBeenCalledWith({
			id: "song1",
			chords: [
				{ bar: 1, bars: 2, chord: "D" },
				{ bar: 3, bars: 1, chord: "A" },
				{ bar: 4, bars: 1, chord: "G" },
			],
			bars: expect.any(Array),
		});
		expect(cd.chordSegments?.map((s) => [s.chord, s.bar, s.bars])).toEqual([
			["D", 1, 2],
			["A", 3, 1],
			["Em", 4, 1],
		]);
		expect(cd.chordsChecked).toEqual({ changed: 1 });
		expect(cd.chordBusy).toBeNull();
		expect(cd.chordError).toBeNull();
	});

	test("without the AI the detector's chords stand unchecked; without a grid nothing runs", async () => {
		const cd = make({ ai: false });
		await cd.detectChords();
		expect(remote.reconcileChords).not.toHaveBeenCalled();
		expect(cd.chordSegments).toHaveLength(3);
		expect(cd.chordsChecked).toBeNull();
		const none = make({ grid: null });
		await none.detectChords();
		expect(none.chordSegments).toBeNull();
		expect(remote.songNotes).toHaveBeenCalledTimes(1);
	});

	test("Cancel drops what a run would still set", async () => {
		let answer!: (v: unknown) => void;
		remote.songNotes.mockReturnValueOnce(new Promise((r) => (answer = r)));
		const cd = make();
		const run = cd.detectChords();
		expect(cd.chordBusy).toBe("Listening…");
		cd.cancelDraft();
		expect(cd.chordBusy).toBeNull();
		expect(notify).toHaveBeenCalledWith("Canceled", { kind: "info" });
		answer({ complete: true, notes: NOTES, doneSeconds: 8, duration: 8 });
		await run;
		expect(cd.chordSegments).toBeNull();
		expect(cd.chordBusy).toBeNull();
	});

	test("a second run stops the first: only the second's chords land", async () => {
		let first!: (v: unknown) => void;
		remote.songNotes.mockReturnValueOnce(new Promise((r) => (first = r)));
		remote.reconcileChords.mockResolvedValue({ chords: null });
		const cd = make();
		const one = cd.detectChords();
		const two = cd.detectChords();
		await two;
		expect(cd.chordSegments?.map((s) => s.chord)).toEqual(["D", "A", "G"]);
		first({ complete: true, notes: NOTES.slice(0, 4), doneSeconds: 8, duration: 8 });
		await one;
		expect(cd.chordSegments?.map((s) => s.chord)).toEqual(["D", "A", "G"]);
		expect(cd.chordBusy).toBeNull();
		expect(remote.reconcileChords).toHaveBeenCalledTimes(1);
	});

	test("Cancel during the draft drops its answer without an error", async () => {
		const cd = make();
		await cd.detectChords();
		let answer!: (v: unknown) => void;
		remote.draftChart.mockReturnValueOnce(new Promise((r) => (answer = r)));
		const run = cd.draftFromChords();
		expect(cd.draftBusy).toBe(true);
		cd.cancelDraft();
		expect(cd.draftBusy).toBe(false);
		answer(DRAFT);
		await run;
		expect(cd.draft).toBeNull();
		expect(cd.chordError).toBeNull();
		expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/failed/), expect.anything());
	});

	test("the panel's button detects first, then drafts; Dismiss clears both", async () => {
		const cd = make();
		await cd.draftFromPanel();
		expect(remote.draftChart).toHaveBeenCalledWith(
			expect.objectContaining({ id: "song1", chords: expect.any(Array) }),
		);
		// The bar starts the chords were read on, and where the last bar ends (the engine's 7.9 s).
		expect(remote.draftChart.mock.calls[0][0].grid).toEqual([0, 2, 4, 6, 7.9]);
		expect(cd.draft).toEqual(DRAFT);
		expect(cd.draftBusy).toBe(false);
		cd.dismiss();
		expect(cd.chordSegments).toBeNull();
		expect(cd.draft).toBeNull();
	});

	test("a failed draft shows its error and says so", async () => {
		remote.draftChart.mockRejectedValueOnce(new Error("gateway down"));
		const cd = make();
		await cd.detectChords();
		await cd.draftFromChords();
		expect(cd.chordError).toBe("gateway down");
		expect(notify).toHaveBeenCalledWith("The draft failed: gateway down", { kind: "error" });
		expect(cd.draftBusy).toBe(false);
	});

	test("a rejected draft as a remote function's error: the card's error and the step's sentence", async () => {
		remote.draftChart.mockRejectedValueOnce({ status: 502, body: { message: "The AI is busy" } });
		const cd = make();
		await cd.draftFromPanel();
		expect(cd.chordError).toBe("The AI is busy");
		expect(notify).toHaveBeenCalledWith("The draft failed: The AI is busy", { kind: "error" });
		expect(cd.draft).toBeNull();
	});

	test("a score's chart replaces the draft, marked as the score's", () => {
		const cd = make();
		cd.draft = DRAFT;
		cd.chordError = "No bars to read";
		const diagnostics = [{ level: "warning" as const, message: "Lyrics were left out." }];
		cd.fromScore({
			chart: "| C | G |",
			chartHtml: "<p>c</p>",
			diagnostics,
			source: "Lead sheet",
			notationId: "score-1",
			id: "score-1",
			kind: "notation",
			parts: [],
		});
		expect(cd.chordError).toBeNull();
		expect(cd.draft).toMatchObject({
			chart: "| C | G |",
			chartHtml: "<p>c</p>",
			sections: [],
			source: "score",
			scoreName: "Lead sheet",
			diagnostics,
			scoreFile: { kind: "notation", id: "score-1" },
		});
	});

	describe("a score without chord symbols: a part charted as note sets (chartPart)", () => {
		const noChords = {
			chart: "",
			chartHtml: "",
			diagnostics: [
				{
					level: "error" as const,
					message: "no chord symbols; these parts have notes: Piano, Bass.",
				},
			],
			source: "Lead sheet",
			notationId: "score-1",
			id: "score-1",
			kind: "notation" as const,
			parts: ["Piano", "Bass"],
		};

		test("the part's chart replaces the empty draft, named after the part", async () => {
			files.chartFromScore.mockResolvedValue({
				chart: "| {C4 E4 G4} |",
				chartHtml: "<p>n</p>",
				diagnostics: [],
				parts: [],
				partName: "Piano",
			});
			const cd = make();
			cd.fromScore(noChords);
			expect(cd.draft).toMatchObject({
				chart: "",
				parts: ["Piano", "Bass"],
				notationId: "score-1",
			});
			const done = cd.chartPart("Piano");
			expect(cd.partBusy).toBe(true);
			await done;
			expect(files.chartFromScore).toHaveBeenCalledWith({ id: "score-1", part: "Piano" });
			expect(cd.partBusy).toBe(false);
			expect(cd.draft).toMatchObject({
				chart: "| {C4 E4 G4} |",
				source: "score",
				scoreName: "Lead sheet",
				notationId: "score-1",
				parts: [],
				partName: "Piano",
				// The file stays the draft's source through the part's chart.
				scoreFile: { kind: "notation", id: "score-1" },
			});
		});

		test("a failed call is an error notification; the draft stays", async () => {
			files.chartFromScore.mockRejectedValue(new Error("The score could not be read"));
			const cd = make();
			cd.fromScore(noChords);
			await cd.chartPart("Bass");
			expect(notify).toHaveBeenCalledWith("The score could not be read", { kind: "error" });
			expect(cd.draft).toMatchObject({ parts: ["Piano", "Bass"] });
			expect(cd.partBusy).toBe(false);
		});
	});

	describe("the chord model's read of the mix", () => {
		test("stored chords make the bars, unchecked by the AI, with the server's notes", async () => {
			remote.songChords.mockImplementation(() => asQuery(STORED));
			const cd = make();
			await cd.detectChords();
			expect(cd.chordSegments?.map((s) => [s.chord, s.bar, s.bars])).toEqual([
				["D", 1, 2],
				["A", 3, 1],
				["G", 4, 1],
			]);
			expect(cd.chordSegments?.[0].confidence).toBe(1);
			expect(cd.chordSource).toBe("model");
			expect(cd.chordsChecked).toBeNull();
			expect(cd.chordBars).toHaveLength(4);
			expect(remote.reconcileChords).not.toHaveBeenCalled();
			expect(cd.chordBusy).toBeNull();
			expect(cd.chordError).toBeNull();
			cd.dismiss();
			expect(cd.chordSource).toBeNull();
		});

		test("the bars' notes stay empty when the server's transcription is not complete", async () => {
			remote.songChords.mockImplementation(() => asQuery(STORED));
			remote.songNotes.mockResolvedValue({
				complete: false,
				notes: [],
				doneSeconds: 2,
				duration: 8,
			});
			const cd = make();
			await cd.detectChords();
			expect(cd.chordSource).toBe("model");
			expect(cd.chordBars).toEqual([]);
			// The stems are decoded once, for the placement only: nothing is transcribed.
			expect(decodedBuffers).toHaveBeenCalledOnce();
			expect(cd.chordsChecked).toBeNull();
		});

		test("while the model runs, the run waits for it and reads its chords when they land", async () => {
			vi.useFakeTimers();
			try {
				remote.songChords
					.mockImplementationOnce(() => asQuery(RUNNING))
					.mockImplementationOnce(() => asQuery(RUNNING))
					.mockImplementation(() => asQuery(STORED));
				const cd = make();
				const run = cd.detectChords();
				await vi.advanceTimersByTimeAsync(0);
				expect(cd.chordBusy).toBe("Reading the chords from the mix on the server…");
				await vi.advanceTimersByTimeAsync(3000);
				expect(remote.songChords).toHaveBeenCalledTimes(2);
				expect(cd.chordSegments).toBeNull();
				await vi.advanceTimersByTimeAsync(3000);
				await run;
				expect(remote.songChords).toHaveBeenCalledTimes(3);
				expect(cd.chordSource).toBe("model");
				expect(cd.chordSegments?.map((s) => s.chord)).toEqual(["D", "A", "G"]);
				expect(remote.reconcileChords).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		test("Cancel stops the wait", async () => {
			vi.useFakeTimers();
			try {
				remote.songChords.mockImplementation(() => asQuery(RUNNING));
				const cd = make();
				const run = cd.detectChords();
				await vi.advanceTimersByTimeAsync(3000);
				cd.cancelDraft();
				await run;
				const polls = remote.songChords.mock.calls.length;
				await vi.advanceTimersByTimeAsync(30_000);
				expect(remote.songChords).toHaveBeenCalledTimes(polls);
				expect(cd.chordSegments).toBeNull();
				expect(remote.songNotes).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});

		test("when the model does not finish in time, the notes path reads the bars", async () => {
			vi.useFakeTimers();
			try {
				remote.songChords.mockImplementation(() => asQuery(RUNNING));
				const cd = make();
				const run = cd.detectChords();
				await vi.advanceTimersByTimeAsync(90_000);
				await run;
				expect(remote.songChords).toHaveBeenCalledTimes(31);
				expect(cd.chordSource).toBe("notes");
				expect(remote.reconcileChords).toHaveBeenCalledTimes(1);
				expect(cd.chordsChecked).toEqual({ changed: 1 });
			} finally {
				vi.useRealTimers();
			}
		});

		test("when no run claims the song within a few polls, the notes path reads the bars without the full wait", async () => {
			vi.useFakeTimers();
			try {
				remote.songChords.mockImplementation(() => asQuery({ ...RUNNING, inFlight: false }));
				const cd = make();
				const run = cd.detectChords();
				await vi.advanceTimersByTimeAsync(12_000);
				await run;
				// The first call, then the polls at 3, 6, 9 and 12 s; the last sees no run and gives up.
				expect(remote.songChords).toHaveBeenCalledTimes(5);
				expect(cd.chordSource).toBe("notes");
				expect(remote.reconcileChords).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		test("without a mix, or when the query fails, the notes path runs with the AI's check", async () => {
			const cd = make();
			await cd.detectChords();
			expect(remote.songChords).toHaveBeenCalledTimes(1);
			expect(cd.chordSource).toBe("notes");
			expect(remote.reconcileChords).toHaveBeenCalledTimes(1);
			expect(cd.chordsChecked).toEqual({ changed: 1 });
			remote.songChords.mockImplementation(() => Promise.reject(new Error("signed out")));
			const other = make();
			await other.detectChords();
			expect(other.chordSource).toBe("notes");
			expect(other.chordSegments?.map((s) => s.chord)).toEqual(["D", "A", "Em"]);
		});
	});

	describe("the chartless placement on the stems", () => {
		const PLACED = {
			barStarts: [0.3, 2.3, 4.3, 6.3, 7.9],
			period: 2,
			beatsPerBar: 4,
			cls: 1,
			decided: true,
			byStart: false,
			witnesses: [],
		};

		test("a placed grid is what the chords are read on and what the draft is built on", async () => {
			remote.songChords.mockImplementation(() => asQuery(STORED));
			placing.chartlessGridInBrowser.mockResolvedValue(placedAs(PLACED));
			const cd = make({ startAt: 0.3 });
			await cd.draftFromPanel();
			expect(placing.chartlessGridInBrowser).toHaveBeenCalledWith(
				expect.objectContaining({
					buffers: [BUFFER],
					cacheKey: expect.stringMatching(/^af1:44100:/),
					declaredBarSeconds: 2,
					beatsPerBar: 4,
					startAt: 0.3,
					runs: MODEL,
					duration: 7.9,
				}),
			);
			expect(cd.placement).toEqual(PLACED);
			expect(remote.draftChart.mock.calls[0][0].grid).toEqual(PLACED.barStarts);
			cd.dismiss();
			expect(cd.placement).toBeNull();
		});

		test("the notes path places too, without the model's chords", async () => {
			placing.chartlessGridInBrowser.mockResolvedValue(placedAs(PLACED));
			const cd = make();
			await cd.detectChords();
			expect(placing.chartlessGridInBrowser).toHaveBeenCalledWith(
				expect.objectContaining({ runs: null, startAt: null }),
			);
			expect(cd.chordSource).toBe("notes");
			expect(cd.placement).toEqual(PLACED);
		});

		test("nothing placed: the declared grid's starts, and no placement", async () => {
			const cd = make();
			await cd.draftFromPanel();
			expect(placing.chartlessGridInBrowser).toHaveBeenCalledOnce();
			expect(cd.placement).toBeNull();
			expect(cd.placementRefusal).toEqual(UNAVAILABLE);
			expect(remote.draftChart.mock.calls[0][0].grid).toEqual([0, 2, 4, 6, 7.9]);
		});

		test("an undecided vote keeps its refusal beside no placement; dismiss clears it", async () => {
			const undecided = { ok: false, reason: "undecided", witnesses: [WITNESS] };
			placing.chartlessGridInBrowser.mockResolvedValue(undecided);
			const cd = make();
			await cd.detectChords();
			expect(cd.placement).toBeNull();
			expect(cd.placementRefusal).toEqual(undecided);
			cd.dismiss();
			expect(cd.placementRefusal).toBeNull();
		});

		test("a failed placement is the declared grid, never a failed run", async () => {
			placing.chartlessGridInBrowser.mockRejectedValue(new Error("no workers"));
			const cd = make();
			await cd.draftFromPanel();
			expect(cd.chordError).toBeNull();
			expect(remote.draftChart.mock.calls[0][0].grid).toEqual([0, 2, 4, 6, 7.9]);
		});

		test("a grid with two tempos is not placed", async () => {
			const twoTempos = barGrid(
				[
					{ kind: "tempo", start: 0, value: "120" },
					{ kind: "tempo", start: 4, value: "90" },
					{ kind: "meter", start: 0, value: "4/4" },
				],
				null,
			);
			const cd = make({ grid: twoTempos });
			await cd.detectChords();
			expect(placing.chartlessGridInBrowser).not.toHaveBeenCalled();
			expect(cd.placement).toBeNull();
			expect(cd.chordSegments).not.toBeNull();
		});
	});

	describe("Generate chart from the stems", () => {
		const PLACED = {
			barStarts: [0.3, 2.3, 4.3, 6.3, 7.9],
			period: 2,
			beatsPerBar: 4,
			cls: 1,
			decided: true,
			byStart: false,
			witnesses: [],
		};
		const TWO_SECTIONS = {
			...DRAFT,
			sections: [
				{ name: "Verse", bar: 1 },
				{ name: "Chorus", bar: 3 },
				{ name: "Off the end", bar: 9 },
			],
		};

		test("the chords, bar one, the sections and the chart saved; the draft goes", async () => {
			remote.songChords.mockImplementation(() => asQuery(STORED));
			placing.chartlessGridInBrowser.mockResolvedValue(placedAs(PLACED));
			remote.draftChart.mockResolvedValue(TWO_SECTIONS);
			const cd = make();
			const run = cd.generateChart();
			expect(cd.progress).not.toBeNull();
			await run;
			expect(ensureGrid).not.toHaveBeenCalled();
			expect(remote.useChartlessGrid).toHaveBeenCalledWith({ id: "song1", startAt: 0.3, bpm: 120 });
			expect(remote.saveSections).toHaveBeenCalledWith({
				id: "song1",
				sections: [
					{ name: "Verse", start: 0.3 },
					{ name: "Chorus", start: 4.3 },
				],
			});
			expect(remote.saveChartDraft).toHaveBeenCalledWith({
				id: "song1",
				markdown: "## Verse",
				replace: false,
				// The chart remembers the stems as its source.
				source: { kind: "stems", at: expect.any(String) },
			});
			expect(cd.draft).toBeNull();
			expect(cd.progress).toBeNull();
			expect(onsaved).toHaveBeenCalledTimes(2);
			expect(notify).toHaveBeenCalledWith(
				"Chart generated from the stems: 4 bars, 3 sections; start of bar 1 set to 0:00.3 and tempo to 120 bpm.",
			);
		});

		test("without a grid, and none from the stems: it fails and nothing else runs", async () => {
			ensureGrid.mockResolvedValueOnce(false);
			const cd = make({ grid: null });
			await cd.generateChart();
			expect(ensureGrid).toHaveBeenCalledOnce();
			expect(cd.chordError).toBe("Set a tempo and a time signature first");
			expect(notify).toHaveBeenCalledWith(
				"Generating the chart failed: Set a tempo and a time signature first",
				{ kind: "error" },
			);
			for (const fn of [
				remote.songChords,
				remote.draftChart,
				remote.useChartlessGrid,
				remote.saveSections,
				remote.saveChartDraft,
			])
				expect(fn).not.toHaveBeenCalled();
			expect(cd.progress).toBeNull();
		});

		test("a failed save ends the run with the step's sentence; the draft stays", async () => {
			remote.saveChartDraft.mockRejectedValueOnce(new Error("Turso answered 502"));
			const cd = make();
			await cd.generateChart();
			expect(cd.chordError).toBe("Turso answered 502");
			expect(notify).toHaveBeenCalledWith("Saving the chart failed: Turso answered 502", {
				kind: "error",
			});
			expect(cd.draft).toEqual(DRAFT);
			expect(onsaved).not.toHaveBeenCalled();
			expect(cd.progress).toBeNull();
		});

		test("a failed start of bar 1 is said, and the chart is still saved", async () => {
			placing.chartlessGridInBrowser.mockResolvedValue(placedAs(PLACED));
			remote.useChartlessGrid.mockRejectedValueOnce(new Error("Not a member"));
			const cd = make();
			await cd.generateChart();
			expect(notify).toHaveBeenCalledWith("Not a member", { kind: "info" });
			expect(remote.saveChartDraft).toHaveBeenCalledOnce();
			expect(cd.chordError).toBeNull();
		});

		test("the song's own sections stay; no placement, no bar one", async () => {
			const cd = make({ hasSections: true });
			await cd.generateChart();
			expect(remote.useChartlessGrid).not.toHaveBeenCalled();
			expect(remote.saveSections).not.toHaveBeenCalled();
			expect(remote.saveChartDraft).toHaveBeenCalledOnce();
			expect(notify).toHaveBeenCalledWith("Chart generated from the stems: 4 bars, 1 section.");
		});

		test("a draft whose timing map was dropped is held on the card: not saved, said once", async () => {
			remote.draftChart.mockResolvedValue({ ...DRAFT, timing: null, diagnostics: [] });
			const cd = make();
			await cd.generateChart();
			expect(remote.saveChartDraft).not.toHaveBeenCalled();
			expect(remote.saveSections).not.toHaveBeenCalled();
			expect(cd.draft).toMatchObject({ chart: "## Verse", timing: null });
			expect(notify).toHaveBeenCalledWith(
				"Chart drafted but not saved: its bar count no longer matches the stems, so it has no timing. Review it on the draft card.",
				{ kind: "info" },
			);
			expect(cd.progress).toBeNull();
		});

		test("on a song with no tempo the run sets one from the stems and holds its draft for review", async () => {
			let grid: typeof GRID | null = null;
			ensureGrid.mockImplementationOnce(async () => {
				grid = GRID;
				return true;
			});
			const cd = make({ gridOf: () => grid });
			await cd.generateChart();
			expect(ensureGrid).toHaveBeenCalledOnce();
			expect(remote.saveChartDraft).not.toHaveBeenCalled();
			expect(cd.draft).not.toBeNull();
			expect(notify).toHaveBeenCalledWith(
				"Chart drafted but not saved: its tempo and time signature were detected from the stems and need checking. Review it on the draft card.",
				{ kind: "info" },
			);
		});

		test("bars that settled 7% off the declared tempo hold the draft (Study 34b's comb drift)", async () => {
			// 120 bpm in 4/4 is a two-second bar; the comb settled at 2.144 s.
			placing.chartlessGridInBrowser.mockResolvedValueOnce(
				placedAs({ ...PLACED, period: 2.144, barStarts: [0.3, 2.444, 4.588, 6.732, 7.9] }),
			);
			const cd = make();
			await cd.generateChart();
			expect(remote.saveChartDraft).not.toHaveBeenCalled();
			expect(cd.draft).not.toBeNull();
			expect(notify).toHaveBeenCalledWith(
				"Chart drafted but not saved: its bars settled 7% off the declared tempo. Review it on the draft card.",
				{ kind: "info" },
			);
		});

		test("a transcription of under three notes a bar holds the draft (Study 34b's starved transcriptions)", async () => {
			// Four bars, eight notes: two a bar.
			remote.songNotes.mockResolvedValueOnce({
				complete: true,
				notes: NOTES.slice(0, 8),
				doneSeconds: 8,
				duration: 8,
			});
			const cd = make();
			await cd.generateChart();
			expect(remote.saveChartDraft).not.toHaveBeenCalled();
			expect(notify).toHaveBeenCalledWith(
				"Chart drafted but not saved: the stems gave too few notes to hear the chords (2.0 a bar). Review it on the draft card.",
				{ kind: "info" },
			);
		});

		test("a draft with an error is held", async () => {
			remote.draftChart.mockResolvedValue({
				...DRAFT,
				diagnostics: [{ level: "error", message: "Bar 3 does not parse" }],
			});
			const cd = make();
			await cd.generateChart();
			expect(remote.saveChartDraft).not.toHaveBeenCalled();
			expect(cd.draft).not.toBeNull();
			expect(notify).toHaveBeenCalledWith(
				"Chart drafted but not saved: the chart has errors. Review it on the draft card.",
				{ kind: "info" },
			);
		});

		test("an undecided vote with a clean draft saves, and the notification says bar 1 was not placed", async () => {
			placing.chartlessGridInBrowser.mockResolvedValue({
				ok: false,
				reason: "undecided",
				witnesses: [WITNESS],
			});
			const cd = make();
			await cd.generateChart();
			expect(remote.useChartlessGrid).not.toHaveBeenCalled();
			expect(remote.saveChartDraft).toHaveBeenCalledOnce();
			expect(cd.draft).toBeNull();
			expect(notify).toHaveBeenCalledWith(
				"Chart generated from the stems: 4 bars, 1 section. Note: bar 1 was not placed from the stems.",
			);
		});
	});
});

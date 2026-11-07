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
}));
vi.mock("#lib/remote/songs.remote.js", () => remote);
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

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
const engine = { status: "ready", duration: 7.9, decodedBuffers } as unknown as StemEngine;

function make({ ai = true, grid = GRID } = {}) {
	return new SongChordDraft({
		songId: () => "song1",
		engine: () => engine,
		grid: () => grid,
		aiAvailable: () => ai,
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

beforeEach(() => {
	vi.clearAllMocks();
	remote.songChords.mockImplementation(() => asQuery(NO_MIX));
	remote.songNotes.mockResolvedValue({ complete: true, notes: NOTES, doneSeconds: 8, duration: 8 });
	remote.reconcileChords.mockResolvedValue({ chords: ["D", "D", "A", "Em"] });
	remote.draftChart.mockResolvedValue(DRAFT);
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

	test("a score's chart replaces the draft, marked as the score's", () => {
		const cd = make();
		cd.draft = DRAFT;
		cd.chordError = "No bars to read";
		const diagnostics = [{ level: "warning" as const, message: "Lyrics were left out." }];
		cd.fromScore({ chart: "| C | G |", chartHtml: "<p>c</p>", diagnostics, source: "Lead sheet" });
		expect(cd.chordError).toBeNull();
		expect(cd.draft).toMatchObject({
			chart: "| C | G |",
			chartHtml: "<p>c</p>",
			sections: [],
			source: "score",
			scoreName: "Lead sheet",
			diagnostics,
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
			expect(decodedBuffers).not.toHaveBeenCalled();
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
});

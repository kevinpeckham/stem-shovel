import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Note } from "#lib/audio/chords.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { barGrid } from "#lib/audio/measures.js";

/**
 * Detect chords and the AI's draft: the server's notes, the AI's check and
 * its draft are stand-ins (the notes cover the song, so nothing is
 * transcribed here); notifications are recorded.
 */
const remote = vi.hoisted(() => ({
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
const engine = { status: "ready", duration: 7.9, decodedBuffers: vi.fn() } as unknown as StemEngine;

function make({ ai = true, grid = GRID } = {}) {
	return new SongChordDraft({
		songId: () => "song1",
		engine: () => engine,
		grid: () => grid,
		aiAvailable: () => ai,
	});
}

const DRAFT = {
	sections: [{ index: "I", name: "Verse", bar: 1 }],
	progressions: [{ section: "Verse", chords: "D A G" }],
	chords: "D % A G",
	chart: "## Verse",
	notes: "",
	chartHtml: "<h2>Verse</h2>",
};

beforeEach(() => {
	vi.clearAllMocks();
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
});

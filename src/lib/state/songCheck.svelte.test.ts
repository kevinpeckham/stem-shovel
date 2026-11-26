import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Detection } from "#lib/audio/analysis.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { AiAnswer } from "#lib/server/aiDetect.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { chartHash } from "@barmark/sync";

/**
 * Scan stems and the AI's song check: the remote functions are stand-ins
 * (the chart cannot be aligned, so the model's placements stand), the rows
 * are a real SongChanges, and notifications are recorded.
 */
const remote = vi.hoisted(() => ({
	askAiAboutSong: vi.fn(),
	chartBarsOf: vi.fn(),
	saveChanges: vi.fn(),
	saveChartTiming: vi.fn(),
}));
vi.mock("#lib/remote/songs.remote.js", () => remote);
const align = vi.hoisted(() => ({ alignChartInBrowser: vi.fn() }));
vi.mock("#lib/audio/alignChartInBrowser.js", () => align);
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { SongCheck } = await import("./songCheck.svelte");
const { SongChanges } = await import("./songChanges.svelte");

const ANSWER: AiAnswer = {
	tempo: 96.4,
	tempoChanges: [],
	meter: "4/4",
	key: "C major",
	keyChanges: [{ at: 30, key: "A♭ major" }],
	notes: "",
};

function make(changes: SongChange[] = [], hasScore = true, arrangementId: string | null = null) {
	const song = { id: "song1", arrangementId, changes, sections: [], startAt: null };
	const onsaved = vi.fn(async () => {});
	const showTab = vi.fn();
	const rows = new SongChanges({
		song: () => song,
		posCtx: () => ({ fps: 25, grid: null }),
		onsaved,
	});
	const check = new SongCheck({
		song: () => song,
		engine: () =>
			({ status: "ready", duration: 60, decodedBuffers: async () => [] }) as unknown as StemEngine,
		aiAvailable: () => true,
		hasScore: () => hasScore,
		changes: rows,
		onsaved,
		showTab,
	});
	return { check, rows, onsaved, showTab };
}

beforeEach(() => {
	vi.clearAllMocks();
	remote.askAiAboutSong.mockResolvedValue(ANSWER);
	remote.chartBarsOf.mockResolvedValue({ bars: null, reason: "none" });
	remote.saveChanges.mockResolvedValue(undefined);
	remote.saveChartTiming.mockResolvedValue({ saved: true });
});
afterEach(() => {
	vi.useRealTimers();
});

/** The mix still rendering: what askAiAboutSong rejects with until it is. */
const MIXING = { status: 409 };

describe("SongCheck", () => {
	test("aiLine and agreementText read as the card says them", () => {
		const { check } = make();
		expect(check.aiLine(ANSWER)).toBe("96 bpm · C major (also A♭ major) · 4/4");
		expect(check.aiLine({ ...ANSWER, tempo: null, meter: "free", keyChanges: [] })).toBe(
			"C major · no meter",
		);
		const d = { tempo: { bpm: 112 } } as Detection;
		expect(check.agreementText({ factor: 1, declared: 112 }, d)).toBe(
			"The stems agree with your 112 bpm.",
		);
		expect(check.agreementText({ factor: 2, declared: 224 }, d)).toMatch(
			/^The stems agree with your 224 bpm \(heard as 112, /,
		);
	});

	test("Ask AI to check holds the answer; Use these writes the rows, keys spelled as barmark writes them, and saves them", async () => {
		const { check, rows } = make([{ kind: "tempo", start: 0, value: "90" }], false);
		await check.askAi();
		expect(remote.askAiAboutSong).toHaveBeenCalledWith({ id: "song1" });
		expect(remote.chartBarsOf).not.toHaveBeenCalled();
		expect(check.aiAnswer?.key).toBe("C major");
		expect(check.aiBusy).toBe(false);
		rows.reset();
		await check.useAiAnswer();
		expect(remote.saveChanges).toHaveBeenCalledWith({
			id: "song1",
			arrangementId: null,
			changes: [
				{ kind: "tempo", start: 0, value: "96" },
				{ kind: "key", start: 0, value: "C" },
				{ kind: "meter", start: 0, value: "4/4" },
				{ kind: "key", start: 30, value: "Ab" },
			],
		});
		expect(check.aiAnswer).toBeNull();
	});

	test("Scan stems on a song with a chart and no settings: the AI's answer is set at once", async () => {
		const { check, showTab } = make();
		await check.scanStems();
		expect(remote.chartBarsOf).toHaveBeenCalled();
		expect(showTab).toHaveBeenCalled();
		expect(remote.saveChanges).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith(
			"The AI read the chart: 96 bpm · C major (also A♭ major) · 4/4 — saved to the song's settings",
			{ timeout: 12_000 },
		);
		expect(check.scanning).toBe(false);
	});

	test("a failed check shows its error", async () => {
		remote.askAiAboutSong.mockRejectedValueOnce(new Error("gateway down"));
		const { check } = make();
		await check.askAi();
		expect(check.aiError).toBe("gateway down");
		expect(check.aiAnswer).toBeNull();
	});

	test("Replace writes the scan's rows over the song's and marks it applied", async () => {
		const { check, onsaved } = make([
			{ kind: "tempo", start: 0, value: "90" },
			{ kind: "key", start: 40, value: "G" },
			{ kind: "meter", start: 0, value: "3/4" },
		]);
		check.scanResult = {
			detection: { tempo: { bpm: 100 } } as Detection,
			keys: [],
			values: [
				{ kind: "tempo", start: 0, value: "100" },
				{ kind: "key", start: 0, value: "D" },
			],
			ladder: null,
			summary: "100 bpm · D",
			alternates: "",
			current: "90 bpm · G",
			applied: false,
		};
		await check.replaceFromScan();
		expect(remote.saveChanges).toHaveBeenCalledWith({
			id: "song1",
			arrangementId: null,
			changes: [
				{ kind: "meter", start: 0, value: "3/4" },
				{ kind: "tempo", start: 0, value: "100" },
				{ kind: "key", start: 0, value: "D" },
			],
		});
		expect(onsaved).toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("Tempo and key replaced from the stems");
		expect(check.scanResult?.applied).toBe(true);
	});

	test("an upload's detection on a song without settings is saved, the detector's key as barmark spells it", async () => {
		const { check } = make();
		const d = {
			tempo: { bpm: 120, confidence: 1, subdivision: "quarter", alternates: [] },
			meter: { value: "4/4", confidence: 1 },
			key: { value: "E♭ major", confidence: 1 },
		} as unknown as Detection;
		await check.applyDetection(d, [
			{ start: 0, value: "E♭ major", confidence: 1 },
			{ start: 30, value: "C♯ minor", confidence: 1 },
		]);
		expect(remote.saveChanges).toHaveBeenCalledWith({
			id: "song1",
			arrangementId: null,
			changes: expect.arrayContaining([
				{ kind: "key", start: 0, value: "Eb" },
				{ kind: "key", start: 30, value: "C#m" },
			]),
		});
	});

	test("on an alternate a save carries the arrangement (detection runs on Main only today; this keeps a later enablement safe)", async () => {
		const { check } = make([], true, "arr1");
		const d = {
			tempo: { bpm: 120, confidence: 1, subdivision: "quarter", alternates: [] },
			meter: { value: "4/4", confidence: 1 },
			key: { value: "D", confidence: 1 },
		} as unknown as Detection;
		await check.applyDetection(d);
		expect(remote.saveChanges).toHaveBeenCalledWith(
			expect.objectContaining({ id: "song1", arrangementId: "arr1" }),
		);
	});

	test("an upload's detection on a song with settings is only reported", async () => {
		const { check } = make([{ kind: "tempo", start: 0, value: "90" }]);
		const d = {
			tempo: { bpm: 120, confidence: 1, subdivision: "quarter", alternates: [] },
			meter: { value: "4/4", confidence: 1 },
			key: { value: "D", confidence: 1 },
		} as unknown as Detection;
		await check.applyDetection(d);
		expect(remote.saveChanges).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Detected 120 bpm/), {
			kind: "info",
		});
	});
	test("the upload's check waits out a rendering mix and uses the answer once it comes", async () => {
		vi.useFakeTimers();
		remote.askAiAboutSong.mockRejectedValueOnce(MIXING).mockRejectedValueOnce(MIXING);
		const { check, showTab } = make();
		const done = check.checkWithScore();
		await vi.advanceTimersByTimeAsync(0);
		expect(remote.askAiAboutSong).toHaveBeenCalledTimes(1);
		expect(check.aiBusy).toBe(true);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(remote.askAiAboutSong).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(10_000);
		await done;
		expect(remote.askAiAboutSong).toHaveBeenCalledTimes(3);
		expect(showTab).toHaveBeenCalled();
		expect(remote.saveChanges).toHaveBeenCalledTimes(1);
		expect(check.aiError).toBeNull();
		expect(check.aiBusy).toBe(false);
	});

	test("after eighteen tries of a rendering mix the check gives up with a notice", async () => {
		vi.useFakeTimers();
		remote.askAiAboutSong.mockRejectedValue(MIXING);
		const { check } = make();
		const done = check.checkWithScore();
		for (let i = 0; i < 17; i++) await vi.advanceTimersByTimeAsync(10_000);
		await done;
		expect(remote.askAiAboutSong).toHaveBeenCalledTimes(18);
		expect(notify).toHaveBeenCalledWith(
			"The mix is still rendering; use Ask AI to check once it is ready",
			{ kind: "info" },
		);
		expect(check.aiError).toBeNull();
		expect(check.aiBusy).toBe(false);
		expect(remote.saveChanges).not.toHaveBeenCalled();
	});

	test("the upload's check does not retry an error other than a rendering mix", async () => {
		vi.useFakeTimers();
		remote.askAiAboutSong.mockRejectedValueOnce(new Error("gateway down"));
		const { check } = make();
		await check.checkWithScore();
		expect(remote.askAiAboutSong).toHaveBeenCalledTimes(1);
		expect(check.aiError).toBe("gateway down");
		expect(check.aiBusy).toBe(false);
	});
});

describe("alignChart aligns the chart's text and keeps the song's own chart's timing map", () => {
	const TEXT = "time: 4/4\n| C | G |\n";
	const bar = (chords: string[], over: Record<string, unknown> = {}) => ({
		measure: 1,
		chords,
		bpm: 120,
		meter: "4/4",
		key: null,
		section: null,
		...over,
	});
	const chart = (over: Record<string, unknown> = {}) => ({
		bars: [bar(["C"], { section: "Verse" }), bar(["G"])],
		warnings: ["Line 1: a warning"],
		source: "chart",
		text: TEXT,
		...over,
	});
	/** A map of `text` (the one listen hashes: the text it aligned). */
	const timingOf = (text: string, bars = 2) => ({
		format: "barmark-timing",
		version: 1,
		chart: { bars, hash: chartHash(text) },
		source: "aligned",
		bars: Array.from({ length: bars }, (_, i) => ({ bar: i + 1, start: 0.5 + 2 * i })),
		end: 0.5 + 2 * bars,
	});
	/** What alignChartInBrowser resolves: the alignment (this recording, an even fit), the map or the refusals. */
	const aligned = (
		over: { barStarts?: number[]; timing?: object | null; refusals?: object[] } = {},
	) => ({
		alignment: {
			barStarts: over.barStarts ?? [0.5, 2.5, 4.5],
			ratio: 5,
			samePiece: true,
			localCost: [0.1, 0.1, 0.1],
			localMedian: 0.1,
			firstSound: 0.4,
			lastSound: 4.5,
		},
		// listen's own placements: not what the app places from.
		placements: { sections: [], keyChanges: [], tempoChanges: [] },
		timing: over.timing === undefined ? timingOf(TEXT) : over.timing,
		refusals: over.refusals ?? [],
		warnings: [],
	});
	const song = (meter: string, bpm: string) =>
		make([
			{ kind: "tempo", start: 0, value: bpm },
			{ kind: "meter", start: 0, value: meter },
		]);

	test("hands the package the chart's text, the song's tempo and declared bar, posts the map it kept, and places from the app's bars", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(aligned());
		const result = await song("4/4", "120").check.alignChart();
		expect(align.alignChartInBrowser).toHaveBeenCalledWith(
			{ chart: TEXT, tempo: 120, declared: { meter: "4/4", tempo: 120 }, startAt: 0 },
			[],
			null,
		);
		expect(remote.saveChartTiming).toHaveBeenCalledWith({ id: "song1", timing: timingOf(TEXT) });
		expect(result).toEqual({
			placements: {
				sections: [{ name: "Verse", start: 0.4, hedged: true }],
				keyChanges: [],
				tempoChanges: [],
				ratio: 5,
				samePiece: true,
			},
			warnings: ["Line 1: a warning"],
		});
	});

	test("a 6/8 song declares its 120 eighths as 40 dotted quarters; a tempo change is the chart bar's, in eighths", async () => {
		const sixEight = "time: 6/8\n| C | G | F |\n";
		remote.chartBarsOf.mockResolvedValue(
			chart({
				text: sixEight,
				bars: [
					bar(["C"], { meter: "6/8" }),
					bar(["G"], { meter: "6/8" }),
					bar(["F"], { meter: "6/8", bpm: 180 }),
				],
			}),
		);
		align.alignChartInBrowser.mockResolvedValue(
			aligned({ barStarts: [0.5, 2, 3.5, 4.5], timing: null }),
		);
		const result = await song("6/8", "120").check.alignChart();
		expect(align.alignChartInBrowser.mock.calls[0]![0]).toEqual({
			chart: sixEight,
			tempo: 40,
			declared: { meter: "6/8", tempo: 40 },
			startAt: 0,
		});
		expect("placements" in result && result.placements.tempoChanges).toEqual([
			{ at: 3.5, bpm: 180, hedged: false },
		]);
	});

	test("a chart without `time:` in a 3/4 song is aligned in 3/4, and its map is kept under the saved chart's hash", async () => {
		const saved = "| C | G |\n";
		const copy = `time: 3/4\n${saved}`;
		remote.chartBarsOf.mockResolvedValue(
			chart({ text: saved, bars: [bar(["C"], { meter: "3/4" }), bar(["G"], { meter: "3/4" })] }),
		);
		align.alignChartInBrowser.mockResolvedValue(aligned({ timing: timingOf(copy) }));
		await song("3/4", "120").check.alignChart();
		expect(align.alignChartInBrowser.mock.calls[0]![0]).toMatchObject({
			chart: copy,
			tempo: 120,
			declared: { meter: "3/4", tempo: 120 },
		});
		expect(remote.saveChartTiming).toHaveBeenCalledWith({ id: "song1", timing: timingOf(saved) });
	});

	test("a score's read is aligned from its text and keeps no map", async () => {
		remote.chartBarsOf.mockResolvedValue(
			chart({ source: "summary", text: "time: 4/4\n| D | A |\n" }),
		);
		align.alignChartInBrowser.mockResolvedValue(aligned());
		await expect(song("4/4", "120").check.alignChart()).resolves.toHaveProperty("placements");
		expect(align.alignChartInBrowser.mock.calls[0]![0]).toMatchObject({
			chart: "time: 4/4\n| D | A |\n",
		});
		expect(remote.saveChartTiming).not.toHaveBeenCalled();
	});

	test("an alignment that does not fit the recording posts nothing and says why, in the fit's words", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(
			aligned({
				timing: null,
				refusals: [
					{ reason: "bar-one-far", message: "", detail: { bar1: 8, music: 0, declaredBar: 2 } },
					{ reason: "bar-length-off", message: "", detail: { medianBar: 1, declaredBar: 2 } },
					{
						reason: "not-same-piece",
						message: "The chart does not sound like this recording: it fits little better.",
					},
				],
			}),
		);
		const result = await song("4/4", "120").check.alignChart();
		expect(result).toHaveProperty("placements");
		expect(remote.saveChartTiming).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			"The chart's alignment did not fit the recording well enough to keep as bar timing: bar 1 at 0:08 where the sound starts at 0:00; bars 1.0 s where the tempo says 2.00 s; the chart does not sound like this recording: it fits little better.",
			{ kind: "info", timeout: 10000 },
		);
	});

	test("a map that does not check is silent", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(
			aligned({ timing: null, refusals: [{ reason: "map-invalid", message: "" }] }),
		);
		await song("4/4", "120").check.alignChart();
		expect(remote.saveChartTiming).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
	});

	test("a song without a tempo and a time signature declares nothing and keeps nothing, silently", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(aligned());
		await make().check.alignChart();
		expect(align.alignChartInBrowser.mock.calls[0]![0]).toEqual({ chart: TEXT, startAt: 0 });
		expect(remote.saveChartTiming).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
	});

	test("a failed post is silent; a failed alignment rejects with its sentence", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(aligned());
		remote.saveChartTiming.mockRejectedValue(new Error("nope"));
		await expect(song("4/4", "120").check.alignChart()).resolves.toBeDefined();
		expect(notify).not.toHaveBeenCalled();
		align.alignChartInBrowser.mockRejectedValue(new Error("The chart has no bars to place"));
		await expect(song("4/4", "120").check.alignChart()).rejects.toThrow("no bars to place");
	});
});

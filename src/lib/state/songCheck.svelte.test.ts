import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Detection } from "#lib/audio/analysis.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { AiAnswer } from "#lib/server/aiDetect.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

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

function make(changes: SongChange[] = [], hasScore = true) {
	const song = { id: "song1", changes, sections: [], startAt: null };
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
			changes: expect.arrayContaining([
				{ kind: "key", start: 0, value: "Eb" },
				{ kind: "key", start: 30, value: "C#m" },
			]),
		});
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

describe("alignChart keeps the song's own chart's timing map", () => {
	const TEXT = "| C | G |\n";
	const bar = (chords: string[]) => ({
		measure: 1,
		chords,
		bpm: 120,
		meter: "4/4",
		key: null,
		section: null,
	});
	const chart = (over: Record<string, unknown> = {}) => ({
		bars: [bar(["C"]), bar(["G"])],
		warnings: [],
		source: "chart",
		text: TEXT,
		...over,
	});
	const alignment = (barStarts: number[]) => ({
		barStarts,
		cost: 0.1,
		controlCost: 0.5,
		localCost: [0.1, 0.1],
		hopSec: 0.1,
		firstSound: 0,
		lastSound: 4,
	});
	const aligned = () => make();

	test("a clean map of the aligned bars is posted with source aligned", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(alignment([0.5, 2.5, 4.5]));
		const { check } = aligned();
		await check.alignChart();
		expect(remote.saveChartTiming).toHaveBeenCalledWith({
			id: "song1",
			timing: expect.objectContaining({
				format: "barmark-timing",
				source: "aligned",
				chart: { bars: 2, hash: expect.stringMatching(/^[0-9a-f]{16}$/) },
				bars: [
					{ bar: 1, start: 0.5 },
					{ bar: 2, start: 2.5 },
				],
				end: 4.5,
			}),
		});
	});

	test("a score's read, or bar starts that do not check, post nothing", async () => {
		remote.chartBarsOf.mockResolvedValue(chart({ source: "summary", text: undefined }));
		align.alignChartInBrowser.mockResolvedValue(alignment([0.5, 2.5, 4.5]));
		await aligned().check.alignChart();
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(alignment([3, 2, 4.5]));
		await aligned().check.alignChart();
		expect(remote.saveChartTiming).not.toHaveBeenCalled();
	});

	test("a failed post is silent", async () => {
		remote.chartBarsOf.mockResolvedValue(chart());
		align.alignChartInBrowser.mockResolvedValue(alignment([0, 2, 4]));
		remote.saveChartTiming.mockRejectedValue(new Error("nope"));
		await expect(aligned().check.alignChart()).resolves.toBeDefined();
		expect(notify).not.toHaveBeenCalled();
	});
});

import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
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
}));
vi.mock("#lib/remote/songs.remote.js", () => remote);
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
		engine: () => ({ status: "ready", duration: 60 }) as unknown as StemEngine,
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
});

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

	test("Ask AI to check holds the answer; Use these writes the rows and saves them", async () => {
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
				{ kind: "key", start: 0, value: "C major" },
				{ kind: "meter", start: 0, value: "4/4" },
				{ kind: "key", start: 30, value: "A♭ major" },
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
});

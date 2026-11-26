import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";

/**
 * The chartless grid's browser side (audio/chartlessGridInBrowser.ts): the
 * recording's features (audio/alignmentWorkers.ts) and the package's
 * `findGrid` are stand-ins; what is tested is what goes in and how the
 * answer, or a failure, comes back.
 */
const features = vi.hoisted(() => ({ format: "barmark-listen-features", duration: 8 }));
const workers = vi.hoisted(() => ({
	recordingFeaturesOf: vi.fn((_buffers: AudioBuffer[], _key: string | null): unknown => null),
}));
vi.mock("./alignmentWorkers.js", async (importOriginal) => ({
	...(await importOriginal<object>()),
	recordingFeaturesOf: workers.recordingFeaturesOf,
}));
const listen = vi.hoisted(() => ({ findGrid: vi.fn((_input: unknown): unknown => null) }));
vi.mock("@barmark/listen", () => listen);

const { chartlessGridInBrowser } = await import("./chartlessGridInBrowser.js");

const buffer = { sampleRate: 8000 } as unknown as AudioBuffer;
const runs = { frameSec: 0.1, frames: 3, runs: [] };
const input = (over: object = {}) => ({
	buffers: [buffer],
	cacheKey: "lf1:8000:st",
	declared: { meter: "6/8", tempo: 40 },
	startAt: null,
	runs,
	...over,
});
const placed = { grid: { bars: [0.5, 3.5, 6.5] }, pickup: null, reading: { cls: 0 } };
const reading = { witnesses: [{ name: "timeZero", cls: null }] };
const UNAVAILABLE = { ok: false, reason: "unavailable", message: "", reading: null };

afterEach(() => {
	workers.recordingFeaturesOf.mockReset();
	listen.findGrid.mockReset();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("chartlessGridInBrowser", () => {
	test("reads the grid on the recording's features with the declared meter and tempo, the start and the chord runs", async () => {
		vi.stubGlobal("Worker", class {});
		workers.recordingFeaturesOf.mockReturnValue(Effect.succeed(features));
		listen.findGrid.mockReturnValue({ ok: true, value: placed, warnings: [] });
		await expect(chartlessGridInBrowser(input())).resolves.toEqual({ ok: true, placed });
		expect(workers.recordingFeaturesOf).toHaveBeenCalledWith([buffer], "lf1:8000:st");
		expect(listen.findGrid).toHaveBeenCalledWith({
			features,
			chords: runs,
			declared: { meter: "6/8", tempo: 40 },
			startAt: null,
		});
	});

	test("the grid's refusal passes through with its reason, its words and the reading", async () => {
		vi.stubGlobal("Worker", class {});
		workers.recordingFeaturesOf.mockReturnValue(Effect.succeed(features));
		listen.findGrid.mockReturnValue({
			ok: false,
			refusals: [{ reason: "downbeat-undecided", message: "The witnesses did not agree." }],
			warnings: [],
			reading,
		});
		await expect(chartlessGridInBrowser(input())).resolves.toEqual({
			ok: false,
			reason: "downbeat-undecided",
			message: "The witnesses did not agree.",
			reading,
		});
	});

	test("a failure of the features, no Worker, no audio or an aborted run resolve the unavailable refusal", async () => {
		vi.stubGlobal("Worker", class {});
		workers.recordingFeaturesOf.mockReturnValue(Effect.fail(new Error("out of memory")));
		await expect(chartlessGridInBrowser(input())).resolves.toEqual(UNAVAILABLE);
		await expect(chartlessGridInBrowser(input({ buffers: [] }))).resolves.toEqual(UNAVAILABLE);
		const controller = new AbortController();
		workers.recordingFeaturesOf.mockReturnValue(Effect.never);
		const pending = chartlessGridInBrowser(input({ signal: controller.signal }));
		controller.abort();
		await expect(pending).resolves.toEqual(UNAVAILABLE);
		vi.stubGlobal("Worker", undefined);
		await expect(chartlessGridInBrowser(input())).resolves.toEqual(UNAVAILABLE);
		expect(listen.findGrid).not.toHaveBeenCalled();
	});

	test("features that take more than 90 s resolve the unavailable refusal", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("Worker", class {});
		workers.recordingFeaturesOf.mockReturnValue(Effect.never);
		const pending = chartlessGridInBrowser(input());
		await vi.advanceTimersByTimeAsync(90_000);
		await expect(pending).resolves.toEqual(UNAVAILABLE);
	});
});

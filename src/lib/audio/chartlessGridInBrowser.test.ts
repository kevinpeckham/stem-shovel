import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { AlignmentFeaturesRecord } from "./alignmentFeaturesCache.js";

/**
 * The chartless grid's browser side (audio/chartlessGridInBrowser.ts): the
 * cache and the grid's arithmetic are stand-ins; the workers are fakes told
 * apart by their module's URL.
 */
const cache = vi.hoisted(() => ({
	readAlignmentFeatures: vi.fn(async (_key: string): Promise<unknown> => null),
	writeAlignmentFeatures: vi.fn(async (_key: string, _record: unknown) => {}),
}));
vi.mock("./alignmentFeaturesCache.js", () => cache);
const grid = vi.hoisted(() => ({
	chartlessGrid: vi.fn((_input: unknown): unknown => ({ barStarts: [0, 2] })),
}));
vi.mock("./chartlessGrid.js", () => grid);

const { chartlessGridInBrowser } = await import("./chartlessGridInBrowser.js");

const buffer = {
	sampleRate: 4,
	length: 2,
	numberOfChannels: 1,
	getChannelData: () => Float32Array.from([1, 1]),
};
const input = (cacheKey: string | null = "af1:4:st") => ({
	buffers: [buffer as unknown as AudioBuffer],
	cacheKey,
	declaredBarSeconds: 2,
	beatsPerBar: 4,
	startAt: null,
	runs: null,
	duration: 8,
});
const features = {
	chroma: new Float32Array(12),
	frames: 1,
	hopSec: 0.1,
	firstSound: 0.5,
	lastSound: 1,
};

/** Workers that answer by kind: the features worker, or the envelope's; `fail` names the kind that errors. */
function fakeWorkers(fail: "features" | "envelope" | null = null) {
	const posted: string[] = [];
	class FakeWorker {
		onmessage: ((e: MessageEvent) => void) | null = null;
		kind: string;
		constructor(url: URL) {
			this.kind = String(url).includes("recordingFeatures") ? "features" : "envelope";
		}
		postMessage(r: { id: number }) {
			posted.push(this.kind);
			const data =
				this.kind === fail
					? { id: r.id, error: "out of memory" }
					: this.kind === "features"
						? { id: r.id, ...features }
						: { id: r.id, onset: new Float32Array(4), fps: 86 };
			queueMicrotask(() => this.onmessage?.({ data } as MessageEvent));
		}
		terminate() {}
	}
	vi.stubGlobal("Worker", FakeWorker);
	return posted;
}

afterEach(() => {
	cache.readAlignmentFeatures.mockReset().mockResolvedValue(null);
	cache.writeAlignmentFeatures.mockReset();
	grid.chartlessGrid.mockClear();
	vi.unstubAllGlobals();
});

describe("chartlessGridInBrowser", () => {
	test("a miss runs both workers, reads the grid from their answers and keeps the record", async () => {
		const posted = fakeWorkers();
		await expect(chartlessGridInBrowser(input())).resolves.toEqual({ barStarts: [0, 2] });
		expect(posted.toSorted()).toEqual(["envelope", "features"]);
		expect(grid.chartlessGrid).toHaveBeenCalledWith(
			expect.objectContaining({ firstSound: 0.5, hopSec: 0.1, fps: 86, duration: 8 }),
		);
		expect(cache.writeAlignmentFeatures.mock.calls[0]![1]).toMatchObject({
			sampleRate: 4,
			fps: 86,
		});
	});

	test("a full record at the buffers' rate posts nothing and writes nothing", async () => {
		const record: AlignmentFeaturesRecord = {
			key: "af1:4:st",
			at: 1,
			sampleRate: 4,
			...features,
			onset: new Float32Array(4),
			fps: 86,
		};
		cache.readAlignmentFeatures.mockResolvedValue(record);
		const posted = fakeWorkers();
		await chartlessGridInBrowser(input());
		expect(posted).toEqual([]);
		expect(grid.chartlessGrid).toHaveBeenCalledOnce();
		expect(cache.writeAlignmentFeatures).not.toHaveBeenCalled();
	});

	test("a worker's error, or no Worker, resolves null and keeps nothing", async () => {
		fakeWorkers("features");
		await expect(chartlessGridInBrowser(input())).resolves.toBeNull();
		expect(cache.writeAlignmentFeatures).not.toHaveBeenCalled();
		vi.stubGlobal("Worker", undefined);
		await expect(chartlessGridInBrowser(input(null))).resolves.toBeNull();
		expect(grid.chartlessGrid).not.toHaveBeenCalled();
	});
});

import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import type { Alignment, Placements } from "@barmark/listen";
import type { TimingMap } from "@barmark/sync";
import * as Effect from "effect/Effect";

/**
 * The chart alignment's browser side (audio/alignChartInBrowser.ts): the
 * recording's features are a stand-in (audio/alignmentWorkers.ts has its
 * own tests), the alignment's worker a fake that answers with what the
 * test gives it.
 */
const features = vi.hoisted(() => ({ format: "barmark-listen-features", sampleRate: 8000 }));
const workers = vi.hoisted(() => ({
	recordingFeaturesOf: vi.fn((_buffers: AudioBuffer[], _key: string | null): unknown => null),
}));
vi.mock("./alignmentWorkers.js", async (importOriginal) => ({
	...(await importOriginal<object>()),
	recordingFeaturesOf: workers.recordingFeaturesOf,
}));

const { alignChartInBrowser } = await import("./alignChartInBrowser.js");

const buffer = { sampleRate: 8000, length: 8, numberOfChannels: 1 } as unknown as AudioBuffer;

const alignment = { barStarts: [0, 2], firstSound: 0 } as unknown as Alignment;
const placements: Placements = { sections: [], keyChanges: [], tempoChanges: [] };
const timing = { format: "barmark-timing" } as unknown as TimingMap;
const fit = { bar1: 0, medianBar: 2, declaredBar: 2, ratio: 3 };

/** A fake alignment worker answering `reply`; null never answers. */
function fakeWorker(reply: ((r: AlignChartRequest) => AlignChartReply) | null) {
	const sent: AlignChartRequest[] = [];
	const terminate = vi.fn();
	class FakeWorker {
		onmessage: ((e: MessageEvent<AlignChartReply>) => void) | null = null;
		onerror: (() => void) | null = null;
		terminate = terminate;
		postMessage(r: AlignChartRequest) {
			sent.push(r);
			if (reply) queueMicrotask(() => this.onmessage?.({ data: reply(r) } as MessageEvent));
		}
	}
	vi.stubGlobal("Worker", FakeWorker);
	return { sent, terminate };
}

const input = { chart: "time: 4/4, tempo: 120\n| D |\n", tempo: 120 };
const refusedWith = (reason: string, before = false) =>
	({
		ok: false,
		refusals: [{ reason, message: `listen: ${reason}` }],
		warnings: [],
		alignment: before ? null : alignment,
		placements: before ? null : placements,
	}) as unknown as Extract<AlignChartReply, { result: unknown }>["result"];

afterEach(() => {
	workers.recordingFeaturesOf.mockReset().mockReturnValue(Effect.succeed(features));
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
workers.recordingFeaturesOf.mockReturnValue(Effect.succeed(features));

describe("alignChartInBrowser", () => {
	test("posts the input with the recording's features to the worker and gives back its alignment, map and placements", async () => {
		const { sent, terminate } = fakeWorker((r) => ({
			id: r.id,
			result: { ok: true, value: { timing, alignment, fit, placements }, warnings: [] },
		}));
		await expect(alignChartInBrowser(input, [buffer], "lf1:8000:a")).resolves.toEqual({
			alignment,
			placements,
			timing,
			refusals: [],
			warnings: [],
		});
		expect(workers.recordingFeaturesOf).toHaveBeenCalledWith([buffer], "lf1:8000:a");
		expect(sent[0]!.input).toEqual({ ...input, features });
		expect(terminate).toHaveBeenCalledOnce();
	});

	test("a refusal after the warping comes back with its alignment and placements, and no map", async () => {
		fakeWorker((r) => ({ id: r.id, result: refusedWith("weak-fit") }));
		await expect(alignChartInBrowser(input, [buffer])).resolves.toEqual({
			alignment,
			placements,
			timing: null,
			refusals: [{ reason: "weak-fit", message: "listen: weak-fit" }],
			warnings: [],
		});
	});

	test.each([
		["no-bars", "The chart has no bars to place"],
		["no-tempo", "The chart has no bars to place"],
		["too-short", "The recording or the chart is too short to align"],
		["too-long", "The recording is too long to align in the browser"],
		["chart-too-long", "The chart runs more than twice as long as the recording; check its tempo"],
		["invalid-input", "listen: invalid-input"],
	])("a refusal before the warping (%s) rejects with the page's sentence", async (reason, text) => {
		fakeWorker((r) => ({ id: r.id, result: refusedWith(reason, true) }));
		await expect(alignChartInBrowser(input, [buffer])).rejects.toThrow(text);
	});

	test("the worker's error, or the features', becomes the rejection's message and the worker ends", async () => {
		const { terminate } = fakeWorker((r) => ({ id: r.id, error: "out of memory" }));
		await expect(alignChartInBrowser(input, [buffer])).rejects.toThrow("out of memory");
		expect(terminate).toHaveBeenCalledOnce();
		workers.recordingFeaturesOf.mockReturnValue(Effect.fail(new Error("no chroma")));
		await expect(alignChartInBrowser(input, [buffer])).rejects.toThrow("no chroma");
	});

	test("no answer in 90 s rejects and ends the worker", async () => {
		vi.useFakeTimers();
		const { terminate } = fakeWorker(null);
		const pending = alignChartInBrowser(input, [buffer]);
		const check = expect(pending).rejects.toThrow("took too long");
		await vi.advanceTimersByTimeAsync(90_000);
		await check;
		expect(terminate).toHaveBeenCalledOnce();
	});

	test("no Worker, or no audio, rejects with a sentence instead of throwing", async () => {
		vi.stubGlobal("Worker", undefined);
		await expect(alignChartInBrowser(input, [buffer])).rejects.toThrow("cannot align");
		fakeWorker(null);
		await expect(alignChartInBrowser(input, [])).rejects.toThrow("no audio");
		expect(workers.recordingFeaturesOf).not.toHaveBeenCalled();
	});
});

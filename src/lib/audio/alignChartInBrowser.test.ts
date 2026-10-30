import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import { alignChartInBrowser } from "./alignChartInBrowser.js";
import type { Alignment } from "./chartAlignment.js";

const buffer = (sampleRate: number, channels: number[][]) =>
	({
		sampleRate,
		length: channels[0]!.length,
		numberOfChannels: channels.length,
		getChannelData: (c: number) => Float32Array.from(channels[c]!),
	}) as unknown as AudioBuffer;

const alignment: Alignment = {
	barStarts: [0, 2],
	cost: 0.1,
	controlCost: 0.5,
	localCost: [0.1],
	hopSec: 0.1,
	firstSound: 0,
	lastSound: 2,
};
const bars = [{ measure: 1, chords: ["D"], bpm: 120, meter: "4/4", key: null, section: null }];

/** A stand-in Worker: keeps what it was sent and answers with `reply` (or never, without one). */
function fakeWorker(reply: ((r: AlignChartRequest) => AlignChartReply) | null) {
	const sent: AlignChartRequest[] = [];
	const terminate = vi.fn();
	class FakeWorker {
		onmessage: ((e: MessageEvent<AlignChartReply>) => void) | null = null;
		onerror: (() => void) | null = null;
		terminate = terminate;
		postMessage(request: AlignChartRequest) {
			sent.push(request);
			if (reply) queueMicrotask(() => this.onmessage?.({ data: reply(request) } as MessageEvent));
		}
	}
	vi.stubGlobal("Worker", FakeWorker);
	return { sent, terminate };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("alignChartInBrowser", () => {
	test("sums the buffers to mono at the first one's rate, posts the bars' timing, and ends the worker", async () => {
		const { sent, terminate } = fakeWorker((r) => ({ id: r.id, alignment }));
		const stereo = buffer(4, [
			[1, 1, 1, 1],
			[0, 0, 0, 0],
		]);
		// Twice the rate, half as long in time: linear interpolation picks every other sample.
		const doubleRate = buffer(8, [[0, 1, 2, 3]]);
		await expect(alignChartInBrowser(bars, [stereo, doubleRate])).resolves.toEqual(alignment);
		expect(Array.from(sent[0]!.recording)).toEqual([0.5, 2.5, 0.5, 0.5]);
		expect(sent[0]!.sampleRate).toBe(4);
		expect(sent[0]!.bars).toEqual([{ chords: ["D"], bpm: 120, meter: "4/4" }]);
		expect(terminate).toHaveBeenCalledOnce();
	});

	test("the worker's error becomes the rejection's message", async () => {
		fakeWorker((r) => ({ id: r.id, error: "The recording or the chart is too short to align" }));
		await expect(alignChartInBrowser(bars, [buffer(4, [[0]])])).rejects.toThrow("too short");
	});

	test("no answer in 90 s rejects and ends the worker", async () => {
		vi.useFakeTimers();
		const { terminate } = fakeWorker(null);
		const pending = alignChartInBrowser(bars, [buffer(4, [[0]])]);
		const check = expect(pending).rejects.toThrow("took too long");
		await vi.advanceTimersByTimeAsync(90_000);
		await check;
		expect(terminate).toHaveBeenCalledOnce();
	});

	test("no Worker, or no audio, rejects with a sentence instead of throwing", async () => {
		vi.stubGlobal("Worker", undefined);
		await expect(alignChartInBrowser(bars, [buffer(4, [[0]])])).rejects.toThrow("cannot align");
		fakeWorker(null);
		await expect(alignChartInBrowser(bars, [])).rejects.toThrow("no audio");
	});
});

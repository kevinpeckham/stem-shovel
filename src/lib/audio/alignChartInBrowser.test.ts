import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import type {
	AlignmentEnvelopeReply,
	AlignmentEnvelopeRequest,
} from "#lib/workers/alignmentEnvelope.worker.js";
import { alignChartInBrowser } from "./alignChartInBrowser.js";
import type { Alignment, AlignmentPath } from "./chartAlignment.js";

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
	rawBarStarts: [0, 2],
	repair: null,
};
const path: AlignmentPath = { alignment, declaredBar: 2 };
const bars = [{ measure: 1, chords: ["D"], bpm: 120, meter: "4/4", key: null, section: null }];

type Request = AlignChartRequest | AlignmentEnvelopeRequest;
type Reply = AlignChartReply | AlignmentEnvelopeReply;
/** What each worker answers, by its module's name; null never answers. */
type Replies = {
	path: ((r: AlignChartRequest) => AlignChartReply) | null;
	envelope: ((r: AlignmentEnvelopeRequest) => AlignmentEnvelopeReply) | null;
};

/** Stand-in Workers told apart by the URL they are built from: each keeps what it was sent and answers with its reply. */
function fakeWorkers(replies: Replies) {
	const sent: { path: AlignChartRequest[]; envelope: AlignmentEnvelopeRequest[] } = {
		path: [],
		envelope: [],
	};
	const terminate = { path: vi.fn(), envelope: vi.fn() };
	class FakeWorker {
		onmessage: ((e: MessageEvent<Reply>) => void) | null = null;
		onerror: (() => void) | null = null;
		kind: keyof Replies;
		terminate: () => void;
		constructor(url: URL) {
			this.kind = String(url).includes("alignmentEnvelope.worker") ? "envelope" : "path";
			this.terminate = terminate[this.kind];
		}
		postMessage(request: Request) {
			(sent[this.kind] as Request[]).push(request);
			const reply = replies[this.kind] as ((r: Request) => Reply) | null;
			if (reply) queueMicrotask(() => this.onmessage?.({ data: reply(request) } as MessageEvent));
		}
	}
	vi.stubGlobal("Worker", FakeWorker);
	return { sent, terminate };
}

/** An envelope with no onsets: the repair has nothing to read, so the path's alignment comes back as it is. */
const noOnsets: Replies["envelope"] = (r) => ({ id: r.id, onset: new Float32Array(0), fps: 86 });

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("alignChartInBrowser", () => {
	test("sums the buffers to mono at the first one's rate, posts it to both workers, and ends them", async () => {
		const { sent, terminate } = fakeWorkers({
			path: (r) => ({ id: r.id, path }),
			envelope: noOnsets,
		});
		const stereo = buffer(4, [
			[1, 1, 1, 1],
			[0, 0, 0, 0],
		]);
		// Twice the rate, half as long in time: linear interpolation picks every other sample.
		const doubleRate = buffer(8, [[0, 1, 2, 3]]);
		await expect(alignChartInBrowser(bars, [stereo, doubleRate])).resolves.toEqual(alignment);
		expect(Array.from(sent.path[0]!.recording)).toEqual([0.5, 2.5, 0.5, 0.5]);
		expect(sent.path[0]!.sampleRate).toBe(4);
		expect(sent.path[0]!.bars).toEqual([{ chords: ["D"], bpm: 120, meter: "4/4" }]);
		// Its own copy: both are transferred.
		expect(Array.from(sent.envelope[0]!.recording)).toEqual([0.5, 2.5, 0.5, 0.5]);
		expect(sent.envelope[0]!.recording).not.toBe(sent.path[0]!.recording);
		expect(sent.envelope[0]!.sampleRate).toBe(4);
		expect(terminate.path).toHaveBeenCalledOnce();
		expect(terminate.envelope).toHaveBeenCalledOnce();
	});

	test("the path's error becomes the rejection's message, and both workers end", async () => {
		const { terminate } = fakeWorkers({
			path: (r) => ({ id: r.id, error: "The recording or the chart is too short to align" }),
			envelope: null,
		});
		await expect(alignChartInBrowser(bars, [buffer(4, [[0]])])).rejects.toThrow("too short");
		expect(terminate.path).toHaveBeenCalledOnce();
		expect(terminate.envelope).toHaveBeenCalledOnce();
	});

	test("the envelope's error fails the alignment too", async () => {
		const { terminate } = fakeWorkers({
			path: (r) => ({ id: r.id, path }),
			envelope: (r) => ({ id: r.id, error: "out of memory" }),
		});
		await expect(alignChartInBrowser(bars, [buffer(4, [[0]])])).rejects.toThrow("out of memory");
		expect(terminate.path).toHaveBeenCalledOnce();
		expect(terminate.envelope).toHaveBeenCalledOnce();
	});

	test("no answer in 90 s rejects and ends both workers", async () => {
		vi.useFakeTimers();
		const { terminate } = fakeWorkers({ path: null, envelope: noOnsets });
		const pending = alignChartInBrowser(bars, [buffer(4, [[0]])]);
		const check = expect(pending).rejects.toThrow("took too long");
		await vi.advanceTimersByTimeAsync(90_000);
		await check;
		expect(terminate.path).toHaveBeenCalledOnce();
		expect(terminate.envelope).toHaveBeenCalledOnce();
	});

	test("no Worker, or no audio, rejects with a sentence instead of throwing", async () => {
		vi.stubGlobal("Worker", undefined);
		await expect(alignChartInBrowser(bars, [buffer(4, [[0]])])).rejects.toThrow("cannot align");
		fakeWorkers({ path: null, envelope: null });
		await expect(alignChartInBrowser(bars, [])).rejects.toThrow("no audio");
	});
});

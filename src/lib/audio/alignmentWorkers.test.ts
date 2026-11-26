import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
	chromaFeatures,
	type Features,
	onsetFeatures,
	recordingFeatures,
} from "@barmark/listen/features";
import * as Effect from "effect/Effect";
import type {
	RecordingFeaturesReply,
	RecordingFeaturesRequest,
} from "#lib/workers/recordingFeatures.worker.js";

/**
 * The recording's features both stem readings share (audio/alignmentWorkers.ts):
 * the cache is a stand-in, the features workers fakes that answer with
 * @barmark/listen's own parts of what they were sent.
 */
const cache = vi.hoisted(() => ({
	readAlignmentFeatures: vi.fn(async (_key: string): Promise<unknown> => null),
	writeAlignmentFeatures: vi.fn(async (_key: string, _features: unknown) => {}),
}));
vi.mock("./alignmentFeaturesCache.js", () => cache);

const { recordingFeaturesOf } = await import("./alignmentWorkers.js");

const RATE = 8000;
const buffer = (sampleRate: number, channels: number[][]) =>
	({
		sampleRate,
		length: channels[0]!.length,
		numberOfChannels: channels.length,
		getChannelData: (c: number) => Float32Array.from(channels[c]!),
	}) as unknown as AudioBuffer;
/** A tenth of a second of a tone at `RATE`. */
const tone = (gain = 0.5) =>
	Array.from({ length: RATE / 10 }, (_, i) => gain * Math.sin((2 * Math.PI * 440 * i) / RATE));

/** Fake features workers: each keeps the request it got and answers its part, or `error` for the part named. */
function fakeWorkers(error: "chroma" | "onset" | null = null) {
	const sent: RecordingFeaturesRequest[] = [];
	const terminate = vi.fn();
	class FakeWorker {
		onmessage: ((e: MessageEvent<RecordingFeaturesReply>) => void) | null = null;
		onerror: (() => void) | null = null;
		terminate = terminate;
		postMessage(r: RecordingFeaturesRequest) {
			sent.push({ ...r, recording: r.recording.slice() });
			const reply = (): RecordingFeaturesReply => {
				if (r.part === error) return { id: r.id, error: "out of memory" };
				if (r.part === "chroma") {
					const c = chromaFeatures(r.recording, r.sampleRate);
					return c.ok ? { id: r.id, chroma: c.value } : { id: r.id, error: "chroma" };
				}
				const o = onsetFeatures(r.recording, r.sampleRate);
				return o.ok ? { id: r.id, onset: o.value } : { id: r.id, error: "onset" };
			};
			queueMicrotask(() => this.onmessage?.({ data: reply() } as MessageEvent));
		}
	}
	vi.stubGlobal("Worker", FakeWorker);
	return { sent, terminate };
}

const run = (buffers: AudioBuffer[], key: string | null) =>
	Effect.runPromise(recordingFeaturesOf(buffers, key));

afterEach(() => {
	cache.readAlignmentFeatures.mockReset().mockResolvedValue(null);
	cache.writeAlignmentFeatures.mockReset();
	vi.unstubAllGlobals();
});

describe("recordingFeaturesOf", () => {
	test("sums the buffers to mono at the first one's rate, posts each part its own copy, and joins them", async () => {
		const { sent, terminate } = fakeWorkers();
		const stereo = buffer(RATE, [tone(), tone(0)]);
		const features = await run([stereo], null);
		const mono = Float32Array.from(tone(0.25));
		expect(sent.map((r) => r.part).toSorted()).toEqual(["chroma", "onset"]);
		for (const r of sent) {
			expect(r.sampleRate).toBe(RATE);
			expect(Array.from(r.recording)).toEqual(Array.from(mono));
		}
		const whole = recordingFeatures(mono, RATE);
		expect(whole.ok && features).toEqual(whole.ok && whole.value);
		expect(features.duration).toBe(mono.length / RATE);
		expect(terminate).toHaveBeenCalledTimes(2);
	});

	test("a part's error fails the reading, ends both workers and keeps nothing", async () => {
		const { terminate } = fakeWorkers("onset");
		await expect(run([buffer(RATE, [tone()])], "lf1:8000:a")).rejects.toThrow("out of memory");
		expect(terminate).toHaveBeenCalledTimes(2);
		expect(cache.writeAlignmentFeatures).not.toHaveBeenCalled();
	});

	describe("with a cache key", () => {
		const KEY = "lf1:8000:st.play-1";
		const kept = (): Features => {
			const r = recordingFeatures(Float32Array.from(tone()), RATE);
			if (!r.ok) throw new Error("no features");
			return r.value;
		};

		test("a hit at the buffers' rate posts nothing and writes nothing", async () => {
			const record = kept();
			cache.readAlignmentFeatures.mockResolvedValue(record);
			const { sent } = fakeWorkers();
			await expect(run([buffer(RATE, [tone()])], KEY)).resolves.toBe(record);
			expect(cache.readAlignmentFeatures).toHaveBeenCalledWith(KEY);
			expect(sent).toEqual([]);
			expect(cache.writeAlignmentFeatures).not.toHaveBeenCalled();
		});

		test("a kept record at another rate is a miss, computed and written over", async () => {
			cache.readAlignmentFeatures.mockResolvedValue({ ...kept(), sampleRate: 16000 });
			const { sent } = fakeWorkers();
			const features = await run([buffer(RATE, [tone()])], KEY);
			expect(sent).toHaveLength(2);
			expect(cache.writeAlignmentFeatures).toHaveBeenCalledExactlyOnceWith(KEY, features);
		});

		test("without a key nothing is read or written", async () => {
			fakeWorkers();
			await run([buffer(RATE, [tone()])], null);
			expect(cache.readAlignmentFeatures).not.toHaveBeenCalled();
			expect(cache.writeAlignmentFeatures).not.toHaveBeenCalled();
		});
	});
});

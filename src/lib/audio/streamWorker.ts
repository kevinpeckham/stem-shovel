/// <reference lib="webworker" />
import { ALL_FORMATS, AudioSampleSink, Input, UrlSource, type AudioSample } from "mediabunny";

/**
 * The streamed stem player's decoder (docs/stem-streaming.md): one worker
 * reads every stem's rendition by byte range (mediabunny's UrlSource on
 * the `+faststart` .m4a), decodes with the browser's own AudioDecoder
 * (WebCodecs, AAC-LC), and feeds the mixer worklet decoded chunks over the
 * MessagePort the main thread hands over, keeping each stem decoded
 * `ahead` seconds past the playhead the worklet reports. A seek carries a
 * generation number: the running decode loops stop, and the worklet drops
 * whatever of the old generation still arrives.
 *
 * Messages from the main thread: load, port, seek, ahead, remove, dispose.
 * Replies: stem (one per stem as it opens), ready, error.
 */

interface StemStream {
	id: string;
	input: Input;
	sink: AudioSampleSink;
	sampleRate: number;
	channels: number;
	duration: number;
	/** The decode loop in flight, by generation; a newer generation stops it. */
	generation: number;
	/** Where decoding has reached, in context samples. */
	horizon: number;
}

/** Compressed bytes kept per stem; the index needs a little, the rest is read as the playhead moves. */
const CACHE_BYTES = 4 * 1024 * 1024;
/** Decoding starts this far before a seek target, since an AAC frame needs the one before it. */
const PRE_ROLL = 0.1;

const streams = new Map<string, StemStream>();
let feed: MessagePort | null = null;
/** The context rate chunks are delivered at; the renditions are 48 kHz and the context is too, else resampled. */
let rate = 48000;
let ahead = 12;
/** The playhead as the worklet last reported it, in context samples, and who waits for it to move. */
let position = 0;
let waiters: (() => void)[] = [];
let generation = 0;

const reply = (m: unknown, transfer: Transferable[] = []) => self.postMessage(m, transfer);

self.onmessage = async (e: MessageEvent) => {
	const m = e.data;
	try {
		switch (m.type) {
			case "load":
				rate = m.rate;
				ahead = m.ahead ?? ahead;
				await Promise.all(m.stems.map((s: { id: string; url: string }) => open(s.id, s.url)));
				reply({ type: "ready" });
				break;
			case "port":
				feed = m.port as MessagePort;
				feed.onmessage = (ev) => {
					if (ev.data?.type === "position") {
						position = ev.data.sample;
						const w = waiters;
						waiters = [];
						for (const wake of w) wake();
					}
				};
				break;
			case "seek":
				generation = m.generation;
				position = Math.round(m.seconds * rate);
				for (const s of streams.values()) void decodeFrom(s, m.seconds, generation);
				break;
			case "ahead":
				ahead = m.seconds;
				break;
			case "remove":
				streams.get(m.id)?.input.dispose();
				streams.delete(m.id);
				break;
			case "dispose":
				for (const s of streams.values()) s.input.dispose();
				streams.clear();
				self.close();
				break;
		}
	} catch (err) {
		reply({
			type: "error",
			id: m.id ?? null,
			message: err instanceof Error ? err.message : String(err),
		});
	}
};

async function open(id: string, url: string): Promise<void> {
	try {
		if (typeof AudioDecoder === "undefined") throw new Error("This browser has no AudioDecoder");
		const input = new Input({
			source: new UrlSource(url, { maxCacheSize: CACHE_BYTES }),
			formats: ALL_FORMATS,
		});
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error("No audio track in the rendition");
		if (!(await track.canDecode()))
			throw new Error(`Cannot decode ${track.codec ?? "this codec"} here`);
		const duration = await track.computeDuration();
		streams.set(id, {
			id,
			input,
			sink: new AudioSampleSink(track),
			sampleRate: track.sampleRate,
			channels: track.numberOfChannels,
			duration,
			generation: -1,
			horizon: 0,
		});
		reply({
			type: "stem",
			id,
			sampleRate: track.sampleRate,
			channels: track.numberOfChannels,
			duration,
		});
	} catch (err) {
		reply({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
	}
}

/** Waits until the playhead comes within `ahead` of the horizon, or the generation moves on. */
function untilNeeded(s: StemStream, gen: number): Promise<void> {
	return new Promise((resolve) => {
		const check = () => {
			if (gen !== generation || s.horizon < position + ahead * rate) resolve();
			else waiters.push(check);
		};
		check();
	});
}

async function decodeFrom(s: StemStream, seconds: number, gen: number): Promise<void> {
	s.generation = gen;
	const fromSample = Math.round(seconds * rate);
	s.horizon = fromSample;
	if (seconds >= s.duration) {
		feed?.postMessage({
			type: "end",
			id: s.id,
			generation: gen,
			sample: Math.round(s.duration * rate),
		});
		return;
	}
	const resampler = s.sampleRate === rate ? null : new Resampler(s.sampleRate, rate);
	try {
		for await (const sample of s.sink.samples(Math.max(0, seconds - PRE_ROLL))) {
			if (gen !== generation || !feed) {
				sample.close();
				return;
			}
			const chunk = planar(sample);
			sample.close();
			let start = Math.round(chunk.timestamp * rate);
			let data = chunk.data;
			if (resampler) {
				data = resampler.run(data);
				start = Math.round(chunk.timestamp * rate);
			}
			const end = start + data[0]!.length;
			// The pre-roll: what lies before the target is dropped, a chunk straddling it is cut.
			if (end <= fromSample) continue;
			if (start < fromSample) {
				const cut = fromSample - start;
				data = data.map((d) => d.subarray(cut));
				start = fromSample;
			}
			feed.postMessage(
				{ type: "chunk", id: s.id, generation: gen, start, data },
				data.map((d) => d.buffer),
			);
			s.horizon = start + data[0]!.length;
			await untilNeeded(s, gen);
			if (gen !== generation) return;
		}
		if (gen === generation)
			feed?.postMessage({ type: "end", id: s.id, generation: gen, sample: s.horizon });
	} catch (err) {
		if (gen === generation)
			reply({ type: "error", id: s.id, message: err instanceof Error ? err.message : String(err) });
	}
}

/** The sample's channels as separate Float32Arrays (WebKit hands interleaved; the copy normalises). */
function planar(sample: AudioSample): { timestamp: number; data: Float32Array[] } {
	const data: Float32Array[] = [];
	for (let ch = 0; ch < sample.numberOfChannels; ch++) {
		const out = new Float32Array(sample.numberOfFrames);
		sample.copyTo(out, { planeIndex: ch, format: "f32-planar" });
		data.push(out);
	}
	return { timestamp: sample.timestamp, data };
}

/** Linear resampling with the phase carried between chunks: the fallback when the context is not at the rendition's rate. */
class Resampler {
	#ratio: number;
	#phase = 0;
	#last: number[] = [];
	constructor(from: number, to: number) {
		this.#ratio = from / to;
	}
	run(data: Float32Array[]): Float32Array[] {
		const inLen = data[0]!.length;
		const outLen = Math.floor((inLen - this.#phase) / this.#ratio);
		const out = data.map(() => new Float32Array(Math.max(0, outLen)));
		for (let ch = 0; ch < data.length; ch++) {
			const src = data[ch]!;
			const prev = this.#last[ch] ?? src[0]!;
			const dst = out[ch]!;
			for (let i = 0; i < outLen; i++) {
				const pos = this.#phase + i * this.#ratio;
				const j = Math.floor(pos);
				const f = pos - j;
				const a = j < 0 ? prev : src[j]!;
				const b = j + 1 < inLen ? src[j + 1]! : src[inLen - 1]!;
				dst[i] = a + (b - a) * f;
			}
			this.#last[ch] = src[inLen - 1]!;
		}
		this.#phase = this.#phase + outLen * this.#ratio - inLen;
		return out;
	}
}

/**
 * A clip segment played from the source's disk copy rather than a decoded
 * buffer (docs/dawn-daw-plan.md D8): the part of the
 * `AudioBufferSourceNode` contract the Studio's `#startSegment` uses
 * (`connect`, `start(when, offset, duration)`, `stop`, `onended`), over a
 * `stream-voice` worklet (static/worklets/stream-voice.js) that holds only
 * the next second or two. `read(fromFrame, frames)` (the cache's
 * `readRange`) gives planar windows at the source's rate; they are
 * resampled to the context's rate when the two differ and transferred to
 * the worklet, which asks for more as it plays. One read is in flight per
 * voice and nothing is kept on the main thread once posted.
 *
 * The worklet's output feeds the clip's strip, so the graph pulls it; no
 * zero-gain tap to the destination is needed (FINDINGS.md "Safari does not
 * render a worklet that nothing pulls" is about a capture whose output
 * goes nowhere).
 */
import { Resampler } from "./resampler";

/** Seconds of source audio read at a time. */
export const STREAM_WINDOW_S = 0.25;
/** Seconds the worklet holds past its cursor before it asks (stream-voice.js, LEAD_S). */
export const STREAM_LEAD_S = 1.5;

export type StreamRead = (fromFrame: number, frames: number) => Promise<Float32Array[] | null>;

export interface StreamVoiceOptions {
	/** The source's key in the cache, for the warnings. */
	key: string;
	/** The source's own rate. */
	sampleRate: number;
	channels: number;
	/** The source's length, in its frames. */
	frames: number;
	read: StreamRead;
}

type FromVoice =
	| { type: "need"; upto: number }
	| { type: "starved"; frame: number }
	| { type: "ended" };

const installed = new WeakMap<BaseAudioContext, Promise<boolean>>();

export class StreamVoice {
	/** Whether this context can run the voice at all. */
	static supported(ctx: BaseAudioContext): boolean {
		return typeof AudioWorkletNode !== "undefined" && !!ctx.audioWorklet;
	}

	/** Adds the worklet module once per context; false when it cannot be (the caller falls back to buffers). */
	static install(ctx: BaseAudioContext): Promise<boolean> {
		let done = installed.get(ctx);
		if (!done) {
			done = StreamVoice.supported(ctx)
				? ctx.audioWorklet.addModule("/worklets/stream-voice.js").then(
						() => true,
						() => false,
					)
				: Promise.resolve(false);
			installed.set(ctx, done);
		}
		return done;
	}

	onended: (() => void) | null = null;
	/** Gaps the worklet played as silence for want of audio. */
	starved = 0;

	readonly #ctx: BaseAudioContext;
	readonly #opts: StreamVoiceOptions;
	readonly #node: AudioWorkletNode;
	#resampler: Resampler | null = null;
	/** Source frames: where the segment's read begins, how far it has been read, where it ends. */
	#srcFrom = 0;
	#srcAt = 0;
	#srcEnd = 0;
	/** Context frames: the voice's length, how many are fed, how far the worklet wants them. */
	#frames = 0;
	#fedTo = 0;
	#want = 0;
	#reading = false;
	#feedDone = false;
	#started = false;
	#ended = false;
	#warnedRead = false;

	constructor(ctx: BaseAudioContext, opts: StreamVoiceOptions) {
		this.#ctx = ctx;
		this.#opts = opts;
		this.#node = new AudioWorkletNode(ctx, "stream-voice", {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			outputChannelCount: [opts.channels],
			processorOptions: { channels: opts.channels },
		});
		this.#node.port.onmessage = (e: MessageEvent<FromVoice>) => this.#fromVoice(e.data);
	}

	connect<T extends AudioNode>(node: T): T {
		this.#node.connect(node);
		return node;
	}

	disconnect(): void {
		this.#node.disconnect();
	}

	/** As `AudioBufferSourceNode.start`: `when` in context seconds, `offset` and `duration` in source seconds. */
	start(when: number, offset = 0, duration?: number): void {
		if (this.#started) throw new Error("A StreamVoice starts once");
		this.#started = true;
		const { sampleRate: srcRate, frames: srcFrames, channels } = this.#opts;
		const rate = this.#ctx.sampleRate;
		const length = Math.max(0, duration ?? srcFrames / srcRate - offset);
		this.#srcFrom = Math.min(srcFrames, Math.max(0, Math.round(offset * srcRate)));
		this.#srcEnd = Math.min(srcFrames, this.#srcFrom + Math.round(length * srcRate));
		this.#srcAt = this.#srcFrom;
		this.#frames = Math.round(length * rate);
		if (srcRate !== rate) this.#resampler = new Resampler(srcRate, rate, channels);
		this.#node.port.postMessage({
			type: "schedule",
			startFrame: Math.round(when * rate),
			frames: this.#frames,
			channels,
		});
		this.#want = Math.round((STREAM_LEAD_S + STREAM_WINDOW_S) * rate);
		void this.#pump();
	}

	/** Ends the voice now; `onended` follows when the worklet confirms. */
	stop(): void {
		if (this.#ended) return;
		this.#feedDone = true;
		this.#node.port.postMessage({ type: "stop" });
		if (!this.#started) this.#finish();
	}

	#fromVoice(m: FromVoice) {
		if (m.type === "need") {
			this.#want = Math.max(this.#want, m.upto);
			void this.#pump();
		} else if (m.type === "starved") {
			if (this.starved++ === 0)
				console.warn(`StreamVoice ${this.#opts.key}: starved at frame ${m.frame}`);
		} else if (m.type === "ended") this.#finish();
	}

	#finish() {
		if (this.#ended) return;
		this.#ended = true;
		this.#feedDone = true;
		this.#node.port.onmessage = null;
		this.disconnect();
		this.onended?.();
	}

	/** Reads windows in order until the worklet has what it asked for; one read at a time. */
	async #pump() {
		if (this.#reading) return;
		this.#reading = true;
		try {
			while (!this.#feedDone && this.#fedTo < Math.min(this.#want, this.#frames))
				await this.#nextWindow();
		} finally {
			this.#reading = false;
		}
	}

	/** Reads, resamples and feeds one window; the last one ends the feed. */
	async #nextWindow() {
		const n = Math.min(
			Math.round(STREAM_WINDOW_S * this.#opts.sampleRate),
			this.#srcEnd - this.#srcAt,
		);
		const planes = n > 0 ? await this.#read(this.#srcAt, n) : [];
		if (!planes) return;
		const got = planes[0]?.length ?? 0;
		this.#srcAt += got;
		const last = got === 0 || this.#srcAt >= this.#srcEnd;
		this.#feed(this.#resampled(planes, last));
		if (last) this.#end();
	}

	async #read(from: number, n: number): Promise<Float32Array[] | null> {
		const planes = await this.#opts.read(from, n).catch(() => null);
		if (planes || this.#feedDone) return planes;
		if (!this.#warnedRead) {
			this.#warnedRead = true;
			console.warn(
				`StreamVoice ${this.#opts.key}: no audio at frame ${from}; the rest plays silent`,
			);
		}
		this.#feedDone = true;
		return null;
	}

	/** The window at the context's rate, the resampler's tail added after the last. */
	#resampled(planes: Float32Array[], last: boolean): Float32Array[] {
		const r = this.#resampler;
		if (!r) return planes;
		const out = planes.length && planes[0]!.length ? r.push(planes) : [];
		if (!last) return out;
		const tail = r.flush();
		if (!out.length) return tail;
		return out.map((p, c) => {
			const joined = new Float32Array(p.length + tail[c]!.length);
			joined.set(p);
			joined.set(tail[c]!, p.length);
			return joined;
		});
	}

	/** Pads a short end with silence (a frame or two of rounding), so the voice is not starved at its last block. */
	#end() {
		this.#feedDone = true;
		const short = this.#frames - this.#fedTo;
		if (short > 0 && short <= Math.round(STREAM_WINDOW_S * this.#ctx.sampleRate))
			this.#feed(Array.from({ length: this.#opts.channels }, () => new Float32Array(short)));
	}

	/** Transfers a window to the worklet, clipped to the voice's length. */
	#feed(planes: Float32Array[]) {
		const len = Math.min(planes[0]?.length ?? 0, this.#frames - this.#fedTo);
		if (len <= 0 || this.#ended) return;
		const clipped = planes.map((p) => (p.length > len ? p.subarray(0, len) : p));
		// Planes may share one buffer (views of a cache read): each buffer is transferred once.
		const buffers = [...new Set(clipped.map((p) => p.buffer as ArrayBuffer))];
		this.#node.port.postMessage({ type: "feed", fromFrame: this.#fedTo, planes: clipped }, buffers);
		this.#fedTo += len;
	}
}

// @ts-nocheck -- the worklet scope (AudioWorkletProcessor, sampleRate, currentFrame, registerProcessor) is not in the app's types; the Voice is tested from Node (streamVoice.worklet.test.ts)
/**
 * The Studio's streaming voice (docs/dawn-daw-plan.md D8): one processor
 * per playing clip segment, standing where an `AudioBufferSourceNode`
 * stood, but holding only the next second or two of its audio. The main
 * thread (src/lib/audio/streamVoice.ts) reads short windows from the
 * source's disk copy, resamples them to the context's rate and transfers
 * them here; the voice plays them against the context's `currentFrame`
 * clock, sample-exact mid-block, and asks for more when what it holds
 * past the play cursor runs short.
 *
 * Messages in: `schedule { startFrame, frames, channels }` (context
 * frames: when on the `currentFrame` clock the voice begins, how many it
 * plays), `feed { fromFrame, planes }` (a window, `fromFrame` counted
 * from the voice's own start, at the context rate), `stop {}`. Messages
 * out: `need { upto }` (feed me through this voice frame), `starved
 * { frame }` (a due frame had no audio; once per gap), `ended` (once,
 * after the last frame or a stop; `process` then returns false).
 */

/** Seconds of audio the voice wants to hold past its cursor before it asks for more. */
export const LEAD_S = 1.5;
/** Seconds of source audio in one window (streamVoice.ts, STREAM_WINDOW_S). */
export const WINDOW_S = 0.25;

/**
 * The voice's state apart from the AudioWorkletProcessor shell, so it can
 * be tested in Node: the sorted windows, the cursor, the messages. `post`
 * receives each outgoing message.
 */
export class Voice {
	constructor(sampleRate, channels, post) {
		this.sampleRate = sampleRate;
		this.channels = channels;
		this.post = post;
		this.lead = Math.round(LEAD_S * sampleRate);
		this.window = Math.round(WINDOW_S * sampleRate);
		/** [{ from, len, planes: Float32Array[] }], sorted by `from`, in voice frames. */
		this.windows = [];
		this.startFrame = null;
		this.frames = 0;
		/** Voice frames played (the cursor). */
		this.cursor = 0;
		this.started = false;
		this.stopped = false;
		this.ended = false;
		this.starving = false;
		this.needPending = false;
	}

	schedule(startFrame, frames) {
		this.startFrame = startFrame;
		this.frames = Math.max(0, frames);
	}

	feed(fromFrame, planes) {
		const len = planes[0]?.length ?? 0;
		if (len === 0 || fromFrame + len <= this.cursor || fromFrame >= this.frames) return;
		const w = { from: fromFrame, len, planes };
		const q = this.windows;
		// In practice ascending; a late one slots in by `from`.
		let i = q.length;
		while (i > 0 && q[i - 1].from > fromFrame) i--;
		q.splice(i, 0, w);
		this.needPending = false;
	}

	stop() {
		this.stopped = true;
	}

	/** The frame through which the audio past the cursor runs without a gap. */
	heldTo() {
		let end = this.cursor;
		for (const w of this.windows) {
			if (w.from > end) break;
			end = Math.max(end, w.from + w.len);
		}
		return end;
	}

	/** Copies voice frames [v, v + n) of window `w` into `out` at block index `i`. */
	copy(out, w, v, i, n) {
		const at = v - w.from;
		for (let c = 0; c < out.length; c++) {
			const src = w.planes[Math.min(c, w.planes.length - 1)];
			out[c].set(src.subarray(at, at + n), i);
		}
	}

	/** Voice frames [v, …) into block indices [i, lim), from the windows; zeros where none is fed. */
	fill(out, i, lim, v) {
		const q = this.windows;
		while (i < lim) {
			while (q.length && q[0].from + q[0].len <= v) q.shift();
			const w = q[0];
			if (w && w.from <= v) {
				const n = Math.min(lim - i, w.from + w.len - v);
				this.copy(out, w, v, i, n);
				this.starving = false;
				i += n;
				v += n;
				continue;
			}
			// A gap: zeros (the block is already zeroed) until the next window or the block's end.
			if (!this.starving) {
				this.starving = true;
				this.post({ type: "starved", frame: v });
			}
			const n = Math.min(lim - i, w ? w.from - v : lim - i);
			i += n;
			v += n;
		}
	}

	/** Asks for more when the audio held past the cursor runs under LEAD; once until fed. */
	ask() {
		if (this.needPending) return;
		const held = this.heldTo();
		if (held >= this.frames || held - this.cursor >= this.lead) return;
		this.needPending = true;
		this.post({ type: "need", upto: Math.min(this.frames, this.cursor + this.lead + this.window) });
	}

	/**
	 * One render quantum starting at context frame `now` into `out` (zeroed
	 * channel arrays, all `blockFrames` long). Returns false once ended.
	 */
	render(out, now, blockFrames) {
		if (this.ended) return false;
		if (this.stopped) return this.end();
		if (this.startFrame === null) return true;
		// Scheduled in the past (the message came late): start now, as an AudioBufferSourceNode does.
		if (!this.started) {
			this.started = true;
			if (this.startFrame < now) this.startFrame = now;
		}
		const first = Math.max(0, this.startFrame - now);
		const lim = Math.min(blockFrames, this.startFrame + this.frames - now);
		if (first < lim) {
			this.fill(out, first, lim, now + first - this.startFrame);
			this.cursor = now + lim - this.startFrame;
			const q = this.windows;
			while (q.length && q[0].from + q[0].len <= this.cursor) q.shift();
		}
		if (now + blockFrames >= this.startFrame + this.frames) return this.end();
		this.ask();
		return true;
	}

	end() {
		this.ended = true;
		this.windows = [];
		this.post({ type: "ended" });
		return false;
	}
}

if (typeof AudioWorkletProcessor !== "undefined") {
	class StreamVoiceProcessor extends AudioWorkletProcessor {
		constructor(options) {
			super();
			const channels = options?.processorOptions?.channels ?? 2;
			this.voice = new Voice(sampleRate, channels, (m) => this.port.postMessage(m));
			this.port.onmessage = (e) => {
				const m = e.data;
				if (m.type === "schedule") this.voice.schedule(m.startFrame, m.frames);
				else if (m.type === "feed") this.voice.feed(m.fromFrame, m.planes);
				else if (m.type === "stop") this.voice.stop();
			};
		}

		process(_inputs, outputs) {
			const out = outputs[0];
			if (!out || out.length === 0) return this.voice.render([], currentFrame, 128);
			return this.voice.render(out, currentFrame, out[0].length);
		}
	}
	registerProcessor("stream-voice", StreamVoiceProcessor);
}

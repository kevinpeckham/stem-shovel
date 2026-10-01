/**
 * The looper's capture (docs/looper.md): copies the input, from a frame
 * on the context's clock, into a buffer of exactly one loop length plus a
 * lead-in (samples before bar 1, so the main thread can shift a late
 * microphone earlier), and posts each full pass back, transferred. The
 * processor's `currentFrame` and the main thread's `currentTime ×
 * sampleRate` are the same clock, so the start needs no estimate and the
 * seam is sample-accurate. Messages in: `arm` {length, lead, startFrame,
 * passes} starts capturing at startFrame − lead, posting a pass every
 * `length` frames until `passes` are done or `finish` arrives (which lets
 * the current pass complete); `cut` posts what the current pass holds
 * (zeros after) at once and disarms. Messages out: `pass` {index,
 * channels: [Float32Array, Float32Array], lead} and `done`.
 */
class LoopCapture extends AudioWorkletProcessor {
	constructor() {
		super();
		this.armed = false;
		this.port.onmessage = (e) => this.handle(e.data);
	}
	handle(m) {
		if (m.type === "arm") {
			this.length = m.length;
			this.lead = m.lead;
			this.from = m.startFrame - m.lead;
			this.passes = m.passes ?? Infinity;
			this.index = 0;
			this.finishing = false;
			this.fresh();
			this.armed = true;
		} else if (m.type === "finish") {
			this.finishing = true;
		} else if (m.type === "ping") {
			// The capture's clock, for a measurement against the main thread's `currentTime` (docs/looper.md, "Verified").
			this.port.postMessage({ type: "pong", frame: currentFrame, id: m.id });
		} else if (m.type === "cut") {
			if (this.armed) {
				this.post();
				this.armed = false;
				this.port.postMessage({ type: "done" });
			}
		}
	}
	fresh() {
		const n = this.length + this.lead;
		this.buf = [new Float32Array(n), new Float32Array(n)];
		this.written = 0;
	}
	post() {
		const channels = this.buf;
		this.port.postMessage({ type: "pass", index: this.index, channels, lead: this.lead }, [
			channels[0].buffer,
			channels[1].buffer,
		]);
	}
	process(inputs) {
		if (!this.armed) return true;
		const input = inputs[0];
		if (!input || input.length === 0) return true;
		const left = input[0];
		const right = input[1] ?? input[0];
		const frames = left.length;
		const start = currentFrame;
		// The first pass starts at `from`; later passes run on without a gap.
		let i = 0;
		const n = this.length + this.lead;
		if (this.written === 0 && this.index === 0) {
			if (start + frames <= this.from) return true;
			// Armed after the lead-in began (a start close ahead): the frames missed stay silent, so index `lead` is still bar 1.
			if (start > this.from) this.written = Math.min(n, start - this.from);
			i = Math.max(0, this.from - start);
		}
		for (; i < frames; i++) {
			if (this.written < n) {
				this.buf[0][this.written] = left[i];
				this.buf[1][this.written] = right[i];
				this.written++;
			}
			if (this.written === n) {
				// The next pass keeps the last `lead` frames as its lead-in (they are the end of this one): copied before the post transfers the buffers away.
				const tail0 = this.buf[0].slice(this.length);
				const tail1 = this.buf[1].slice(this.length);
				this.post();
				this.index++;
				if (this.index >= this.passes || this.finishing) {
					this.armed = false;
					this.port.postMessage({ type: "done" });
					return true;
				}
				this.fresh();
				this.buf[0].set(tail0, 0);
				this.buf[1].set(tail1, 0);
				this.written = this.lead;
			}
		}
		return true;
	}
}
registerProcessor("loop-capture", LoopCapture);

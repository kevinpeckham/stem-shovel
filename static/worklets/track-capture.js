/**
 * The Studio's capture (docs/multitrack-recorder.md): one of these per armed
 * track. Armed with `{ startFrame, lead, channels }` it copies its input
 * from `startFrame − lead` on, posting a chunk of frames every
 * `chunkFrames` (transferable, so nothing is copied twice) until `stop`,
 * when the chunk under way goes out followed by `done`. The main thread
 * appends the chunks into the take; the lead-in holds the samples a late
 * input is shifted earlier by. `currentFrame` here and
 * `ctx.currentTime × sampleRate` on the main thread are one clock, so the
 * first frame needs no estimate and every armed track starts on the same
 * sample. Messages in: `arm`, `stop`, `ping` (answers `pong` with the frame).
 * Messages out: `chunk` { index, channels: Float32Array[], from }, `done`.
 */
class TrackCapture extends AudioWorkletProcessor {
	constructor() {
		super();
		this.armed = false;
		this.stopping = false;
		this.channels = 1;
		this.port.onmessage = (e) => this.handle(e.data);
	}
	handle(m) {
		if (m.type === "arm") {
			this.channels = m.channels === 2 ? 2 : 1;
			this.from = m.startFrame - m.lead;
			this.chunkFrames = m.chunkFrames ?? 8192;
			this.index = 0;
			this.filled = 0;
			this.buf = this.open();
			this.stopping = false;
			this.armed = true;
		} else if (m.type === "stop") {
			if (!this.armed) return;
			this.stopping = true;
		} else if (m.type === "ping") {
			this.port.postMessage({ type: "pong", frame: currentFrame, id: m.id });
		}
	}
	open() {
		const buf = [];
		for (let c = 0; c < this.channels; c++) buf.push(new Float32Array(this.chunkFrames));
		return buf;
	}
	post(last) {
		const out =
			this.filled === this.chunkFrames ? this.buf : this.buf.map((b) => b.slice(0, this.filled));
		this.port.postMessage(
			{
				type: "chunk",
				index: this.index,
				channels: out,
				from: this.from + this.index * this.chunkFrames,
				last,
			},
			out.map((b) => b.buffer),
		);
		this.index++;
		this.filled = 0;
		this.buf = this.open();
	}
	process(inputs) {
		if (!this.armed) return true;
		const input = inputs[0];
		const frames = 128;
		const start = currentFrame;
		const end = start + frames;
		// Before the start there is nothing to keep; a block straddling it keeps its tail.
		if (end > this.from) {
			const a = Math.max(start, this.from);
			for (let f = a; f < end; f++) {
				for (let c = 0; c < this.channels; c++) {
					const src = input && input.length ? (input[c] ?? input[0]) : null;
					this.buf[c][this.filled] = src ? src[f - start] : 0;
				}
				this.filled++;
				if (this.filled === this.chunkFrames) this.post(false);
			}
		}
		if (this.stopping) {
			this.post(true);
			this.armed = false;
			this.stopping = false;
			this.port.postMessage({ type: "done" });
		}
		return true;
	}
}
registerProcessor("track-capture", TrackCapture);

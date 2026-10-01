/**
 * The looper's capture (docs/looper.md): copies the input into one buffer
 * per pass of the loop, each covering a lead-in before the pass's bar 1,
 * the pass itself and a tail after its end (`lead` frames each side), so
 * the main thread can shift a late source earlier by up to `lead` and
 * still have the whole loop. Consecutive passes overlap by two leads, so
 * up to two buffers fill at once. The processor's `currentFrame` and the
 * main thread's `currentTime × sampleRate` are the same clock, so the
 * start needs no estimate and the seam is sample-accurate. Messages in:
 * `arm` {length, lead, startFrame, passes} captures from startFrame − lead,
 * posting a pass once its tail is in, until `passes` are done or `finish`
 * arrives (which lets the pass under way complete); `cut` posts the pass
 * under way as it stands and disarms; `ping` answers `pong` with the
 * frame. Messages out: `pass` {index, channels: [left, right], lead} with
 * bar 1 at index `lead`, and `done`.
 */
class LoopCapture extends AudioWorkletProcessor {
	constructor() {
		super();
		this.armed = false;
		this.active = [];
		this.port.onmessage = (e) => this.handle(e.data);
	}
	handle(m) {
		if (m.type === "arm") {
			this.length = m.length;
			this.lead = m.lead;
			this.startFrame = m.startFrame;
			this.passes = m.passes ?? Infinity;
			this.finishing = false;
			this.nextIndex = 0;
			this.active = [];
			this.armed = true;
		} else if (m.type === "finish") {
			// The pass under way completes and no other opens; pressed before bar 1, the first pass is still taken.
			this.passes = Math.max(1, this.nextIndex);
			this.finishing = true;
		} else if (m.type === "cut") {
			if (this.armed) {
				const current = this.active[0];
				if (current) this.post(current);
				this.active = [];
				this.armed = false;
				this.port.postMessage({ type: "done" });
			}
		} else if (m.type === "ping") {
			this.port.postMessage({ type: "pong", frame: currentFrame, id: m.id });
		}
	}
	/** Pass `index` covers frames [from, from + size). */
	open(index) {
		const size = this.length + 2 * this.lead;
		return {
			index,
			from: this.startFrame + index * this.length - this.lead,
			size,
			buf: [new Float32Array(size), new Float32Array(size)],
		};
	}
	post(pass) {
		this.port.postMessage(
			{ type: "pass", index: pass.index, channels: pass.buf, lead: this.lead },
			[pass.buf[0].buffer, pass.buf[1].buffer],
		);
	}
	process(inputs) {
		if (!this.armed) return true;
		const input = inputs[0];
		if (!input || input.length === 0) return true;
		const left = input[0];
		const right = input[1] ?? input[0];
		const frames = left.length;
		const start = currentFrame;
		const end = start + frames;
		// Open the passes whose range this block reaches (the first may already have begun: its missed frames stay silent).
		while (
			this.nextIndex < this.passes &&
			this.startFrame + this.nextIndex * this.length - this.lead < end
		) {
			this.active.push(this.open(this.nextIndex));
			this.nextIndex++;
		}
		for (const pass of this.active) {
			const a = Math.max(start, pass.from);
			const b = Math.min(end, pass.from + pass.size);
			for (let f = a; f < b; f++) {
				pass.buf[0][f - pass.from] = left[f - start];
				pass.buf[1][f - pass.from] = right[f - start];
			}
		}
		// Post the passes whose tail is in.
		while (this.active.length && this.active[0].from + this.active[0].size <= end) {
			this.post(this.active.shift());
		}
		if (this.active.length === 0 && this.nextIndex >= this.passes) {
			this.armed = false;
			this.port.postMessage({ type: "done" });
		}
		return true;
	}
}
registerProcessor("loop-capture", LoopCapture);

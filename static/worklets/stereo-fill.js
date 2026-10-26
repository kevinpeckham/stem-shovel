// @ts-nocheck -- the worklet scope (AudioWorkletProcessor, registerProcessor) is not in the app's types; the fill is tested from Node (stereoFill.worklet.test.ts)
/**
 * The stereo fill (docs/uploads-and-blob.md "The session recorder"): the
 * stage before a `MediaStreamAudioDestinationNode` that a `MediaRecorder`
 * records, so a mono input lands on both channels of the stereo file. A
 * phone's microphone is one channel, and on iOS the destination's own
 * up-mix (channelCount 2, "speakers") left the right channel silent
 * (Kevin, 2026-10-26: a session recorded on the iPhone played back on
 * the left only). The capture worklets (track-capture, loop-capture) have
 * always copied the left channel into a missing right one themselves;
 * this does the same for the recorder paths, and covers the other shape
 * of the fault too: a two-channel input whose right channel is digital
 * silence. The left channel passes as it is. The right is the input's
 * right once that has carried a non-zero sample (a stereo interface's
 * right input has a noise floor, so a real stereo source opens it in its
 * first block), and a copy of the left until then.
 */
export class StereoFill {
	constructor() {
		this.stereo = false;
	}
	/** Fills `out` (two channels of `frames`) from `input` (zero, one or two channels). */
	render(input, out, frames) {
		const left = input[0];
		const right = input[1];
		if (!left) {
			out[0].fill(0, 0, frames);
			out[1].fill(0, 0, frames);
			return;
		}
		if (!this.stereo && right) {
			for (let i = 0; i < frames; i++) {
				if (right[i] !== 0) {
					this.stereo = true;
					break;
				}
			}
		}
		out[0].set(left.subarray(0, frames));
		out[1].set((this.stereo && right ? right : left).subarray(0, frames));
	}
}

if (typeof AudioWorkletProcessor !== "undefined") {
	class StereoFillProcessor extends AudioWorkletProcessor {
		constructor() {
			super();
			this.fill = new StereoFill();
		}
		process(inputs, outputs) {
			const out = outputs[0];
			if (!out || out.length < 2) return true;
			this.fill.render(inputs[0] ?? [], out, out[0].length);
			return true;
		}
	}
	registerProcessor("stereo-fill", StereoFillProcessor);
}

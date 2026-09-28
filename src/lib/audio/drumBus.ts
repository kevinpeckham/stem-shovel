import type { DrumFx } from "$lib/val/DrumPatternSchema";

/**
 * The drum machine's mixer bus (docs/drum-machine.md, "Reverb and delay"):
 * a dry input straight into the master, a delay bus (a DelayNode with a
 * feedback gain and a low-pass in the loop, timed in steps so it follows
 * the tempo) and a reverb bus (a ConvolverNode over an impulse response
 * synthesized here, a burst of noise dying away, so no file is needed),
 * each coming back through its own return level. Rows send into the two
 * buses; `update` follows the project's settings and tempo. Shared by the
 * live engine and the offline render, so a WAV carries the effects.
 */
export interface DrumBus {
	dry: AudioNode;
	delay: AudioNode;
	reverb: AudioNode;
	update(fx: DrumFx, bpm: number): void;
}

export function createDrumBus(ctx: BaseAudioContext, fx: DrumFx, bpm: number): DrumBus {
	const master = ctx.createGain();
	master.gain.value = 0.9;
	master.connect(ctx.destination);

	const dry = ctx.createGain();
	dry.connect(master);

	// Delay: input → delay → return → master, with delay → damping → feedback → delay round the loop.
	const delayIn = ctx.createGain();
	const delay = ctx.createDelay(4);
	const damping = ctx.createBiquadFilter();
	damping.type = "lowpass";
	damping.frequency.value = 3200;
	const feedback = ctx.createGain();
	const delayReturn = ctx.createGain();
	delayIn.connect(delay);
	delay.connect(damping);
	damping.connect(feedback);
	feedback.connect(delay);
	delay.connect(delayReturn);
	delayReturn.connect(master);

	// Reverb: input → convolver → return → master.
	const reverbIn = ctx.createGain();
	const convolver = ctx.createConvolver();
	const reverbReturn = ctx.createGain();
	reverbIn.connect(convolver);
	convolver.connect(reverbReturn);
	reverbReturn.connect(master);

	let impulseSize = -1;
	const update = (next: DrumFx, tempo: number) => {
		const stepSeconds = 60 / tempo / 4;
		delay.delayTime.value = Math.min(4, next.delayTime * stepSeconds);
		feedback.gain.value = next.delayFeedback;
		delayReturn.gain.value = next.delayReturn;
		reverbReturn.gain.value = next.reverbReturn;
		if (next.reverbSize !== impulseSize) {
			impulseSize = next.reverbSize;
			convolver.buffer = reverbImpulse(ctx, next.reverbSize);
		}
	};
	update(fx, bpm);
	return { dry, delay: delayIn, reverb: reverbIn, update };
}

/**
 * A room, synthesized: stereo noise that decays exponentially, half a
 * second at size 0 up to three and a half at size 1, with the top rolled
 * off as it fades the way real rooms do. Unity at the start, so a full
 * send at the default return reads as a wet drum, not a whisper
 * (measured offline: a snare's tail sits 18 dB under the hit a dotted
 * eighth later, 21 dB at half a second; a big room 15 and 17).
 */
export function reverbImpulse(ctx: BaseAudioContext, size: number): AudioBuffer {
	const seconds = 0.5 + 3 * Math.min(1, Math.max(0, size));
	const rate = ctx.sampleRate;
	const length = Math.ceil(seconds * rate);
	const buffer = ctx.createBuffer(2, length, rate);
	const tau = seconds / 5; // the tail is 60 dB down by the end
	for (let ch = 0; ch < 2; ch++) {
		const data = buffer.getChannelData(ch);
		let low = 0;
		for (let i = 0; i < length; i++) {
			const t = i / rate;
			const env = Math.exp(-t / tau);
			// Darken with time: blend towards a one-pole low-pass of the noise as the tail goes on.
			const white = Math.random() * 2 - 1;
			low += (white - low) * 0.25;
			const mix = Math.min(1, t / seconds);
			data[i] = (white * (1 - mix) + low * mix) * env;
		}
	}
	return buffer;
}

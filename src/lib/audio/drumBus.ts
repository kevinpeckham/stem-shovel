import type { DrumFx } from "$lib/val/DrumPatternSchema";
import { createDelayStage, createFuzzStage, createWahStage } from "./fxStages";

/**
 * The drum machine's mixer bus (docs/drum-machine.md, "Reverb and delay"):
 * a dry input through a fuzz and a wah (fxStages.ts; drive 0 and mix 0
 * pass it clean; the wah sweeps once per some bars, following the tempo)
 * into the master, a delay bus (the shared delay stage, digital or analog,
 * timed in steps so it follows the tempo) and a reverb bus (a
 * ConvolverNode over an impulse response synthesized here, a burst of
 * noise dying away, so no file is needed), each coming back through its
 * own return level. Rows send into the two buses; `update` follows the
 * project's settings and tempo. Shared by the live engine and the offline
 * render, so a WAV carries the effects.
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

	// Dry → fuzz → master; a drum hit peaks near 0.8.
	const dry = ctx.createGain();
	const fuzz = createFuzzStage(ctx, 0.8);
	dry.connect(fuzz.input);
	// A drum hit peaks near 0.8 and a kick's fundamental under a sharp peak is a bump: resonance to 10 dB (a full-resonance sweep on a hot sawtooth peaked at 0.97 with 12).
	// Gain compensation of 3.5 dB at full mix (Kevin: more wah read as less volume): the starting beat measured 3 dB quieter fully wet by RMS, more to the ear with the top gone; at 5 dB the acoustic kit peaked at 1.0 with full resonance, at 3.5 it has headroom.
	const wah = createWahStage(ctx, 0.8, 10, 3.5);
	fuzz.output.connect(wah.input);
	wah.output.connect(master);

	// Delay: input → delay stage → master.
	const delay = createDelayStage(ctx, 4);
	delay.output.connect(master);

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
		delay.update(
			{
				time: next.delayTime * stepSeconds,
				feedback: next.delayFeedback,
				level: next.delayReturn,
				analog: next.delayAnalog,
			},
			0,
		);
		fuzz.update(next.fuzzDrive, next.fuzzTone, 0);
		// One sweep per `wahBars` bars of four beats (sixteen steps).
		wah.update(
			{
				mode: "sweep",
				sensitivity: 0,
				rate: 1 / (next.wahBars * 16 * stepSeconds),
				range: next.wahRange,
				resonance: next.wahResonance,
				mix: next.wahMix,
			},
			0,
		);
		reverbReturn.gain.value = next.reverbReturn;
		if (next.reverbSize !== impulseSize) {
			impulseSize = next.reverbSize;
			convolver.buffer = reverbImpulse(ctx, next.reverbSize);
		}
	};
	update(fx, bpm);
	return { dry, delay: delay.input, reverb: reverbIn, update };
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

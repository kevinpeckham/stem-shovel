import type { PianoInstrumentId } from "$lib/constants/piano";
import { frequencyOfMidi } from "./pitch";

/**
 * One note of the piano's synthesized sounds (docs/piano.md): a few
 * oscillators through a filter and an amplitude envelope into `out`.
 * `start` builds and starts it at `when`; the returned `release` begins the
 * envelope's release at `when` and stops the oscillators after it. All of
 * it is plain Web Audio, so an OfflineAudioContext renders it the same.
 * Velocity (0 to 1) sets the level and, where the sound has one, how far
 * the filter opens.
 */
export interface SynthVoice {
	release(when: number): void;
}

interface Envelope {
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}
interface Partial {
	type: OscillatorType;
	/** Frequency as a multiple of the note's. */
	ratio: number;
	gain: number;
	/** Cents off, for a chorus of detuned saws. */
	detune?: number;
	/** The partial's own decay to silence, seconds (a bell's high tine dying away first). */
	fade?: number;
}
interface Patch {
	partials: Partial[];
	env: Envelope;
	/** Low-pass cutoff at rest and how far velocity opens it. */
	cutoff: number;
	cutoffVelocity: number;
	/** The filter's own envelope: opens by `sweep` Hz on the attack and settles over `sweepDecay` seconds. */
	sweep?: number;
	sweepDecay?: number;
	/** Vibrato depth in cents (organ) at 6 Hz. */
	vibrato?: number;
	/** Semitones the sound sits off the key played (a bass an octave down). */
	transpose?: number;
	level: number;
}

/** The synthesized sounds; the Grand Piano is sampled (pianoSamples.ts). */
const PATCHES: Record<Exclude<PianoInstrumentId, "grand">, Patch> = {
	epiano: {
		partials: [
			{ type: "sine", ratio: 1, gain: 1 },
			{ type: "sine", ratio: 2, gain: 0.35, fade: 0.9 },
			{ type: "triangle", ratio: 1, gain: 0.25 },
			{ type: "sine", ratio: 7, gain: 0.06, fade: 0.15 },
		],
		env: { attack: 0.003, decay: 1.4, sustain: 0.25, release: 0.35 },
		cutoff: 2400,
		cutoffVelocity: 4000,
		level: 0.7,
	},
	organ: {
		partials: [
			{ type: "sine", ratio: 0.5, gain: 0.5 },
			{ type: "sine", ratio: 1, gain: 1 },
			{ type: "sine", ratio: 2, gain: 0.6 },
			{ type: "sine", ratio: 3, gain: 0.4 },
			{ type: "sine", ratio: 4, gain: 0.3 },
		],
		env: { attack: 0.01, decay: 0.05, sustain: 1, release: 0.08 },
		cutoff: 6000,
		cutoffVelocity: 0,
		vibrato: 3,
		level: 0.35,
	},
	synth: {
		partials: [
			{ type: "sawtooth", ratio: 1, gain: 0.6, detune: -7 },
			{ type: "sawtooth", ratio: 1, gain: 0.6, detune: 7 },
			{ type: "square", ratio: 0.5, gain: 0.3 },
		],
		env: { attack: 0.01, decay: 0.4, sustain: 0.7, release: 0.25 },
		cutoff: 500,
		cutoffVelocity: 2500,
		sweep: 3500,
		sweepDecay: 0.4,
		level: 0.45,
	},
	pad: {
		partials: [
			{ type: "sawtooth", ratio: 1, gain: 0.5, detune: -12 },
			{ type: "sawtooth", ratio: 1, gain: 0.5, detune: 12 },
			{ type: "triangle", ratio: 2, gain: 0.25 },
		],
		env: { attack: 0.5, decay: 1, sustain: 0.8, release: 1.5 },
		cutoff: 900,
		cutoffVelocity: 800,
		sweep: 600,
		sweepDecay: 2,
		level: 0.4,
	},
	pluck: {
		partials: [
			{ type: "triangle", ratio: 1, gain: 1 },
			{ type: "sine", ratio: 2, gain: 0.4, fade: 0.3 },
		],
		env: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.3 },
		cutoff: 800,
		cutoffVelocity: 3000,
		sweep: 4000,
		sweepDecay: 0.12,
		level: 0.7,
	},
	// A fingered electric bass (Kevin: for the chord player's notes mode): a sine body with a triangle and a touch of saw for the string's growl, a low filter that opens with the pluck and settles, an octave down.
	bass: {
		partials: [
			{ type: "sine", ratio: 1, gain: 1 },
			{ type: "triangle", ratio: 1, gain: 0.45 },
			{ type: "sawtooth", ratio: 1, gain: 0.18, fade: 0.5 },
			{ type: "sine", ratio: 2, gain: 0.12, fade: 0.25 },
		],
		env: { attack: 0.004, decay: 0.9, sustain: 0.35, release: 0.12 },
		cutoff: 220,
		cutoffVelocity: 700,
		sweep: 900,
		sweepDecay: 0.18,
		transpose: -12,
		level: 0.9,
	},
	// The guitar's stand-in while its samples decode: a plucked string, bright and quick to fade.
	guitar: {
		partials: [
			{ type: "triangle", ratio: 1, gain: 1 },
			{ type: "sine", ratio: 2, gain: 0.35, fade: 0.4 },
			{ type: "sawtooth", ratio: 1, gain: 0.12, fade: 0.2 },
		],
		env: { attack: 0.003, decay: 1.2, sustain: 0, release: 0.25 },
		cutoff: 1200,
		cutoffVelocity: 4000,
		sweep: 3000,
		sweepDecay: 0.1,
		level: 0.7,
	},
};

export function startVoice(
	ctx: BaseAudioContext,
	out: AudioNode,
	instrument: Exclude<PianoInstrumentId, "grand">,
	midi: number,
	velocity: number,
	when: number,
): SynthVoice {
	const patch = PATCHES[instrument];
	const f = frequencyOfMidi(midi + (patch.transpose ?? 0));
	const v = Math.min(1, Math.max(0, velocity));
	const peak = patch.level * (0.2 + 0.8 * v ** 1.5);

	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.Q.value = 0.7;
	const cutoff = patch.cutoff + patch.cutoffVelocity * v;
	if (patch.sweep) {
		filter.frequency.setValueAtTime(cutoff + patch.sweep * (0.3 + 0.7 * v), when);
		filter.frequency.setTargetAtTime(cutoff, when, (patch.sweepDecay ?? 0.3) / 3);
	} else {
		filter.frequency.setValueAtTime(cutoff, when);
	}

	const amp = ctx.createGain();
	const { attack, decay, sustain, release } = patch.env;
	amp.gain.setValueAtTime(0.0001, when);
	amp.gain.linearRampToValueAtTime(peak, when + attack);
	amp.gain.setTargetAtTime(peak * Math.max(sustain, 0.0001), when + attack, decay / 3);
	filter.connect(amp);
	amp.connect(out);

	const oscillators: OscillatorNode[] = [];
	const lfo = patch.vibrato ? ctx.createOscillator() : null;
	const lfoGain = lfo ? ctx.createGain() : null;
	if (lfo && lfoGain) {
		lfo.frequency.value = 6;
		lfoGain.gain.value = patch.vibrato ?? 0;
		lfo.connect(lfoGain);
		lfo.start(when);
	}
	for (const p of patch.partials) {
		const osc = ctx.createOscillator();
		osc.type = p.type;
		osc.frequency.value = f * p.ratio;
		if (p.detune) osc.detune.value = p.detune;
		if (lfoGain) lfoGain.connect(osc.detune);
		const g = ctx.createGain();
		g.gain.setValueAtTime(p.gain, when);
		if (p.fade) g.gain.setTargetAtTime(0.0001, when, p.fade / 3);
		osc.connect(g);
		g.connect(filter);
		osc.start(when);
		oscillators.push(osc);
	}

	let released = false;
	return {
		release(at: number) {
			if (released) return;
			released = true;
			amp.gain.cancelScheduledValues(at);
			amp.gain.setTargetAtTime(0.0001, at, release / 4);
			const stopAt = at + release + 0.1;
			for (const osc of oscillators) osc.stop(stopAt);
			lfo?.stop(stopAt);
		},
	};
}

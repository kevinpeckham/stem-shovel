import type { AmpCabinetId } from "#lib/constants/amp.js";
import { applyBiquad, biquad, magnitudeAt } from "./biquad.js";

/**
 * A speaker cabinet's impulse response, synthesized (docs/practice-amp.md,
 * "The cabinet"): a delta through the box's filters (a high-pass at the
 * cone's limit, a resonance where the box and the cone agree, the
 * roll-off above the cone's break-up with a last bump before it, a
 * steeper one above that), plus a few damped modes where a cone rings
 * and a close reflection off the baffle. Made by hand (no licence to
 * read), fifty milliseconds long, mono, scaled so a kilohertz passes at
 * unity. For a ConvolverNode with `normalize` off.
 */
interface Cabinet {
	highPassHz: number;
	resonance: { hz: number; db: number; q: number };
	bumps: { hz: number; db: number; q: number }[];
	lowPassHz: number;
	lowPassQ: number;
	/** The cone's ringing modes: a frequency, a decay in seconds and a level. */
	modes: { hz: number; decay: number; level: number }[];
}
const CABINETS: Record<AmpCabinetId, Cabinet> = {
	"open-2x12": {
		highPassHz: 75,
		resonance: { hz: 110, db: 3, q: 1.2 },
		bumps: [
			{ hz: 2800, db: 2.5, q: 1.5 },
			{ hz: 450, db: -1.5, q: 1 },
		],
		lowPassHz: 5200,
		lowPassQ: 1.1,
		modes: [
			{ hz: 1700, decay: 0.004, level: 0.04 },
			{ hz: 3300, decay: 0.003, level: 0.03 },
		],
	},
	"open-1x12": {
		highPassHz: 90,
		resonance: { hz: 125, db: 3.5, q: 1.3 },
		bumps: [
			{ hz: 1800, db: 2, q: 1.3 },
			{ hz: 3600, db: 1.5, q: 2 },
		],
		lowPassHz: 4800,
		lowPassQ: 1.2,
		modes: [
			{ hz: 1300, decay: 0.005, level: 0.05 },
			{ hz: 2700, decay: 0.003, level: 0.03 },
		],
	},
	"fridge-8x10": {
		highPassHz: 40,
		resonance: { hz: 90, db: 4, q: 1.1 },
		bumps: [
			{ hz: 700, db: -1.5, q: 0.9 },
			{ hz: 2200, db: 1.5, q: 1.5 },
		],
		lowPassHz: 3800,
		lowPassQ: 1,
		modes: [
			{ hz: 1100, decay: 0.005, level: 0.04 },
			{ hz: 2400, decay: 0.003, level: 0.02 },
		],
	},
	"combo-4x10": {
		highPassHz: 45,
		resonance: { hz: 100, db: 3, q: 1.1 },
		bumps: [
			{ hz: 3000, db: 1.5, q: 1.5 },
			{ hz: 7000, db: 2, q: 1.5 },
		],
		lowPassHz: 9000,
		lowPassQ: 0.8,
		modes: [
			{ hz: 1400, decay: 0.003, level: 0.03 },
			{ hz: 2800, decay: 0.002, level: 0.02 },
		],
	},
};

const LENGTH_SECONDS = 0.05;

export function cabinetImpulseSamples(id: AmpCabinetId, rate: number): Float32Array<ArrayBuffer> {
	const cab = CABINETS[id];
	const n = Math.round(LENGTH_SECONDS * rate);
	const samples = new Float32Array(n);
	samples[0] = 1;
	// A reflection off the baffle, 0.9 ms later and 14 dB down, inverted as a reflection is.
	const reflection = Math.round(0.0009 * rate);
	if (reflection < n) samples[reflection] = -0.2;
	applyBiquad(samples, biquad("highpass", rate, cab.highPassHz, 0.8));
	applyBiquad(
		samples,
		biquad("peaking", rate, cab.resonance.hz, cab.resonance.q, cab.resonance.db),
	);
	for (const b of cab.bumps) applyBiquad(samples, biquad("peaking", rate, b.hz, b.q, b.db));
	applyBiquad(samples, biquad("lowpass", rate, cab.lowPassHz, cab.lowPassQ));
	applyBiquad(samples, biquad("lowpass", rate, cab.lowPassHz * 1.6, 0.7));
	for (const m of cab.modes) {
		const w = (2 * Math.PI * m.hz) / rate;
		for (let i = 0; i < n; i++)
			samples[i]! += m.level * Math.sin(w * i) * Math.exp(-i / rate / m.decay);
	}
	// Fade the last fifth so the response ends without a step.
	const fade = Math.round(n / 5);
	for (let i = n - fade; i < n; i++) samples[i]! *= (n - i) / fade;
	// Unity across the body of the instrument: the mean response over 250 to 800 Hz.
	const probes = [250, 400, 600, 800];
	const ref = probes.reduce((sum, hz) => sum + magnitudeAt(samples, rate, hz), 0) / probes.length;
	if (ref > 0) for (let i = 0; i < n; i++) samples[i]! /= ref;
	return samples;
}

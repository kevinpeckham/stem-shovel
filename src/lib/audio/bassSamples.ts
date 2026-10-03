import { frequencyOfMidi } from "./pitch";
import type { SampledVoice } from "./pianoSamples";

/**
 * The Electric Bass's samples (docs/piano.md, "The bass"): FreePats' Finger
 * Bass YR, twelve chromatic notes E1 to D#2 (MIDI 28 to 39) as mp3 in
 * static/kits/bass, fetched once and decoded once a context exists. A note
 * plays the sample of its pitch class shifted by whole octaves, so the
 * whole keyboard is covered by the one octave recorded, and the sound sits
 * an octave under the key played (a bass under a chord player's notes).
 */
const NAMES = ["E1", "F1", "Fs1", "G1", "Gs1", "A1", "As1", "B1", "C2", "Cs2", "D2", "Ds2"];
const LOWEST = 28;
const TRANSPOSE = -12;
const files = new Map<number, Promise<ArrayBuffer>>();
const buffers = new Map<number, AudioBuffer>();
let decoding: Promise<void> | null = null;

/** Fetch the files without a context (no gesture needed), so the first touch finds them in. */
export function warmBassSamples(): void {
	if (files.size) return;
	NAMES.forEach((name, i) => {
		files.set(
			LOWEST + i,
			fetch(`/kits/bass/${name}.mp3`).then((r) => {
				if (!r.ok) throw new Error(`${name}.mp3: ${r.status}`);
				return r.arrayBuffer();
			}),
		);
	});
}
export const bassSamplesReady = () => buffers.size === NAMES.length;

export function loadBassSamples(ctx: BaseAudioContext): Promise<void> {
	if (bassSamplesReady()) return Promise.resolve();
	if (decoding) return decoding;
	warmBassSamples();
	decoding = Promise.all(
		[...files].map(async ([midi, file]) => {
			if (buffers.has(midi)) return;
			buffers.set(midi, await ctx.decodeAudioData((await file).slice(0)));
		}),
	).then(
		() => {
			decoding = null;
		},
		(e) => {
			decoding = null;
			files.clear();
			throw e;
		},
	);
	return decoding;
}

/** One note of the bass into `out`, or null until the samples are decoded. */
export function startBassVoice(
	ctx: BaseAudioContext,
	out: AudioNode,
	midi: number,
	velocity: number,
	when: number,
): SampledVoice | null {
	if (!bassSamplesReady()) return null;
	const played = midi + TRANSPOSE;
	const sample = LOWEST + ((((played - LOWEST) % 12) + 12) % 12);
	const buffer = buffers.get(sample);
	if (!buffer) return null;
	const v = Math.min(1, Math.max(0, velocity));
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.35 + 0.65 * v, when);
	gain.connect(out);
	// A touch lighter plays darker, as a finger does.
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.value = 1200 + 5000 * v;
	filter.connect(gain);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = frequencyOfMidi(played) / frequencyOfMidi(sample);
	source.connect(filter);
	source.start(when);
	let released = false;
	return {
		release(at) {
			if (released) return;
			released = true;
			gain.gain.cancelScheduledValues(at);
			gain.gain.setTargetAtTime(0.0001, at, 0.04);
			source.stop(at + 0.3);
		},
	};
}

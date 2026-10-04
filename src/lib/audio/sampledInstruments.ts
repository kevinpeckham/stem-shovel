import { frequencyOfMidi } from "./pitch";
import type { SampledVoice } from "./pianoSamples";

/**
 * The small sampled instruments beside the Grand Piano (docs/piano.md,
 * "The bass and the guitar"): a handful of mp3 notes in static/kits/<id>,
 * fetched only once the instrument is chosen (never at page load) and
 * decoded as each file lands, so the first note plays from its own sample
 * as soon as that one is in while the synthesized stand-in covers the
 * rest. A note plays the nearest sample shifted by the smallest interval,
 * octaves preferred (the bass has one octave recorded; the guitar most of
 * its range). `scripts/instrument-samples.ts` builds the files from the
 * FreePats recordings.
 */
export interface SampledSpec {
	/** The sample notes (MIDI) in static/kits/<id>/<name>.mp3, named C2, Cs2…. */
	notes: number[];
	/** Semitones the sound sits off the key played (the bass an octave down). */
	transpose: number;
	/** The release's time constant, seconds. */
	release: number;
	/** The level at the softest and the hardest touch. */
	level: [number, number];
	/** The low-pass at the softest and the hardest touch, Hz. */
	cutoff: [number, number];
}
export type SampledInstrumentId = "bass" | "guitar";
const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);
export const SAMPLED: Record<SampledInstrumentId, SampledSpec> = {
	// FreePats' Finger Bass YR: E1 to D#2, an octave down from the key.
	bass: {
		notes: range(28, 39),
		transpose: -12,
		release: 0.04,
		level: [0.35, 1],
		cutoff: [1200, 6200],
	},
	// FreePats' Spanish classical guitar: G1 to C6 with gaps, at pitch.
	guitar: {
		notes: [
			31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 52, 53, 54, 55, 56, 57, 58,
			59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82,
			83, 84,
		],
		transpose: 0,
		release: 0.06,
		level: [0.3, 1],
		cutoff: [2500, 9000],
	},
};
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
export const sampleName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

const files = new Map<SampledInstrumentId, Map<number, Promise<ArrayBuffer>>>();
const buffers = new Map<SampledInstrumentId, Map<number, AudioBuffer>>();
const decoding = new Map<SampledInstrumentId, Promise<void>>();

/** Fetch the files without a context (no gesture needed); nothing happens until an instrument is chosen. */
export function warmSamples(id: SampledInstrumentId): void {
	if (files.has(id)) return;
	const spec = SAMPLED[id];
	const map = new Map<number, Promise<ArrayBuffer>>();
	// Middle first, so the notes most likely played land first.
	for (const midi of [...spec.notes].sort((a, b) => Math.abs(a - 60) - Math.abs(b - 60)))
		map.set(
			midi,
			fetch(`/kits/${id}/${sampleName(midi)}.mp3`).then((r) => {
				if (!r.ok) throw new Error(`${id}/${sampleName(midi)}.mp3: ${r.status}`);
				return r.arrayBuffer();
			}),
		);
	files.set(id, map);
}
const samplesReady = (id: SampledInstrumentId) =>
	(buffers.get(id)?.size ?? 0) === SAMPLED[id].notes.length;

/** Decode as each file lands; a note can play from its sample before the rest are in. */
export function loadSamples(id: SampledInstrumentId, ctx: BaseAudioContext): Promise<void> {
	if (samplesReady(id)) return Promise.resolve();
	const pending = decoding.get(id);
	if (pending) return pending;
	warmSamples(id);
	const got = buffers.get(id) ?? new Map<number, AudioBuffer>();
	buffers.set(id, got);
	const job = Promise.all(
		[...files.get(id)!].map(async ([midi, file]) => {
			if (got.has(midi)) return;
			got.set(midi, await ctx.decodeAudioData((await file).slice(0)));
		}),
	).then(
		() => {
			decoding.delete(id);
		},
		(e) => {
			decoding.delete(id);
			files.delete(id);
			throw e;
		},
	);
	decoding.set(id, job);
	return job;
}

/** The sample to play a note from and the rate to play it at: the smallest shift, an octave of a same-pitch-class sample counting as little. */
function nearestSample(spec: SampledSpec, midi: number): { sample: number; rate: number } {
	let best = spec.notes[0]!;
	let bestCost = Infinity;
	for (const s of spec.notes) {
		const octaves = Math.round((midi - s) / 12);
		const semis = Math.abs(midi - s - 12 * octaves);
		// A semitone of shift costs one; an octave costs a little under two, so the nearest real note wins when one is within a few semitones.
		const cost = semis + Math.abs(octaves) * 1.8;
		if (cost < bestCost) {
			bestCost = cost;
			best = s;
		}
	}
	return { sample: best, rate: frequencyOfMidi(midi) / frequencyOfMidi(best) };
}

/** One note into `out`, or null until its sample is decoded (the engine's synthesized stand-in plays instead). */
export function startSampledInstrumentVoice(
	ctx: BaseAudioContext,
	out: AudioNode,
	id: SampledInstrumentId,
	midi: number,
	velocity: number,
	when: number,
): SampledVoice | null {
	const spec = SAMPLED[id];
	const played = midi + spec.transpose;
	const { sample, rate } = nearestSample(spec, played);
	const buffer = buffers.get(id)?.get(sample);
	if (!buffer) return null;
	const v = Math.min(1, Math.max(0, velocity));
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(spec.level[0] + (spec.level[1] - spec.level[0]) * v, when);
	gain.connect(out);
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.value = spec.cutoff[0] + (spec.cutoff[1] - spec.cutoff[0]) * v;
	filter.connect(gain);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = rate;
	source.connect(filter);
	source.start(when);
	let released = false;
	return {
		release(at) {
			if (released) return;
			released = true;
			gain.gain.cancelScheduledValues(at);
			gain.gain.setTargetAtTime(0.0001, at, spec.release);
			source.stop(at + spec.release * 8);
		},
	};
}

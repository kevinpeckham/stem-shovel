import { frequencyOfMidi } from "./pitch";

/**
 * The Grand Piano (docs/piano.md, Phase 2): thirty notes of the Salamander
 * Grand Piano, Alexander Holm's CC-BY 3.0 recordings of a Yamaha C5, in
 * the mp3 subset Tone.js publishes, one sample every three semitones from
 * A0 to C8 (static/kits/piano/<note>.mp3, two megabytes in all). A note
 * plays the nearest sample pitched by its playbackRate, at most a semitone
 * and a half off, which the ear does not catch on a piano. Fetched on
 * `warm` (the piano page at load; the home page's demo on its first touch),
 * decoded on `load` once there is a context, kept for the page's life.
 */
export const PIANO_SAMPLE_NOTES = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
export const pianoSampleFile = (midi: number) =>
	`${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}.mp3`;

let files: Map<number, Promise<ArrayBuffer>> | null = null;
const buffers = new Map<number, AudioBuffer>();
let decoding: Promise<void> | null = null;
let failed = false;

export function pianoSamplesReady(): boolean {
	return buffers.size === PIANO_SAMPLE_NOTES.length;
}
export function pianoSamplesFailed(): boolean {
	return failed;
}

export function warmPianoSamples(): void {
	if (files || typeof fetch === "undefined") return;
	files = new Map(
		PIANO_SAMPLE_NOTES.map((midi) => [
			midi,
			fetch(`/kits/piano/${pianoSampleFile(midi)}`).then((r) => {
				if (!r.ok) throw new Error(`${r.status} for ${pianoSampleFile(midi)}`);
				return r.arrayBuffer();
			}),
		]),
	);
}

export function loadPianoSamples(ctx: BaseAudioContext): Promise<void> {
	warmPianoSamples();
	if (decoding) return decoding;
	decoding = Promise.all(
		[...files!].map(async ([midi, file]) => {
			if (buffers.has(midi)) return;
			const bytes = (await file).slice(0);
			buffers.set(midi, await ctx.decodeAudioData(bytes));
		}),
	)
		.then(() => undefined)
		.catch((e: unknown) => {
			failed = true;
			decoding = null;
			files = null;
			throw e;
		});
	return decoding;
}

/** The sample nearest a note, and the rate that pitches it there. */
export function nearestPianoSample(midi: number): { sample: number; rate: number } {
	let sample = PIANO_SAMPLE_NOTES[0]!;
	for (const n of PIANO_SAMPLE_NOTES) if (Math.abs(n - midi) < Math.abs(sample - midi)) sample = n;
	return { sample, rate: frequencyOfMidi(midi) / frequencyOfMidi(sample) };
}

export interface SampledVoice {
	release(when: number): void;
}

/**
 * One note of the Grand Piano into `out`: the nearest sample at the right
 * rate, its level from the velocity, and a low-pass that closes a little
 * for a soft touch (the recordings are of firm strokes). Letting go damps
 * the string over a quarter of a second, as the felt does.
 */
export function startSampledVoice(
	ctx: BaseAudioContext,
	out: AudioNode,
	midi: number,
	velocity: number,
	when: number,
): SampledVoice | null {
	const { sample, rate } = nearestPianoSample(midi);
	const buffer = buffers.get(sample);
	if (!buffer) return null;
	const v = Math.min(1, Math.max(0, velocity));
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = rate;
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.value = 2500 + 12000 * v * v;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.15 + 0.85 * v * v, when);
	source.connect(filter);
	filter.connect(gain);
	gain.connect(out);
	source.start(when);
	let released = false;
	return {
		release(at) {
			if (released) return;
			released = true;
			gain.gain.cancelScheduledValues(at);
			gain.gain.setTargetAtTime(0.0001, at, 0.07);
			source.stop(at + 0.5);
		},
	};
}

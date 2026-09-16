import type { Note } from "./chords";

/**
 * Notes from the tonal stems with Spotify's Basic Pitch (Apache 2.0), in
 * the browser: the stems weighted as tonal are summed to mono, resampled to
 * the 22050 Hz the model wants, and run through it. The model files are
 * served from /basic-pitch (copied from the package). Loaded on demand —
 * TensorFlow.js is a megabyte the page does not need otherwise.
 */
const MODEL_URL = "/basic-pitch/model.json";
const MODEL_RATE = 22050;

export async function transcribeNotes(
	stems: { buffer: AudioBuffer; weight: number }[],
	maxSeconds: number,
	onProgress?: (percent: number) => void,
): Promise<Note[]> {
	const tonal = stems.filter((s) => s.weight >= 0.35);
	if (tonal.length === 0) return [];
	const rate = tonal[0].buffer.sampleRate;
	const length = Math.min(
		Math.floor(maxSeconds * rate),
		Math.max(...tonal.map((s) => s.buffer.length)),
	);
	const mono = new Float32Array(length);
	for (const { buffer, weight } of tonal) {
		for (let c = 0; c < buffer.numberOfChannels; c++) {
			const data = buffer.getChannelData(c);
			const n = Math.min(length, data.length);
			for (let i = 0; i < n; i++) mono[i] += (data[i] * weight) / buffer.numberOfChannels;
		}
	}
	let peak = 0;
	for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
	if (peak > 0) for (let i = 0; i < mono.length; i++) mono[i] /= peak;
	const resampled = await resample(mono, rate, MODEL_RATE);
	const { BasicPitch, noteFramesToTime, outputToNotesPoly } = await import("@spotify/basic-pitch");
	const frames: number[][] = [];
	const onsets: number[][] = [];
	const contours: number[][] = [];
	const model = new BasicPitch(MODEL_URL);
	await model.evaluateModel(
		resampled,
		(f, o, c) => {
			frames.push(...f);
			onsets.push(...o);
			contours.push(...c);
		},
		(p) => onProgress?.(p),
	);
	// Thresholds a little above the defaults: chords want confident notes, not every flicker.
	const events = noteFramesToTime(
		outputToNotesPoly(frames, onsets, 0.5, 0.3, 11, true, 3000, 40, true, 11),
	);
	return events.map((e) => ({
		start: e.startTimeSeconds,
		end: e.startTimeSeconds + e.durationSeconds,
		pitch: e.pitchMidi,
		amplitude: e.amplitude,
	}));
}

async function resample(mono: Float32Array, from: number, to: number): Promise<Float32Array> {
	if (from === to) return mono;
	const length = Math.ceil((mono.length * to) / from);
	const ctx = new OfflineAudioContext(1, length, to);
	const buffer = ctx.createBuffer(1, mono.length, from);
	buffer.copyToChannel(new Float32Array(mono), 0);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.connect(ctx.destination);
	source.start();
	const out = await ctx.startRendering();
	return out.getChannelData(0);
}

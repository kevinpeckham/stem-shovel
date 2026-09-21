/**
 * Pitch of a short buffer of samples, for the tuner: McLeod's normalised
 * square difference (an autocorrelation scaled so a perfect repeat reads 1),
 * the first strong peak refined by a parabola. Pure functions, tested on
 * synthesized tones (pitch.test.ts).
 */

export interface Pitch {
	/** Hz. */
	frequency: number;
	/** 0..1: how periodic the buffer was; below ~0.8 is noise or silence. */
	clarity: number;
}

export interface Note {
	/** "A", "F♯"… */
	name: string;
	octave: number;
	midi: number;
	/** Distance from the note's pitch, −50..50. */
	cents: number;
}

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/**
 * The buffer's pitch, or null when nothing periodic enough is there.
 * Searches `minHz`..`maxHz`; the window must hold two periods of the lowest
 * pitch wanted (2048 samples at 48 kHz reach a bass's low E at 41 Hz).
 */
export function detectPitch(
	x: Float32Array,
	sampleRate: number,
	{ minHz = 40, maxHz = 1500, minClarity = 0.85 } = {},
): Pitch | null {
	const n = x.length;
	const maxLag = Math.min(n - 2, Math.floor(sampleRate / minHz));
	const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
	const nsdf = new Float32Array(maxLag + 1);
	for (let tau = minLag; tau <= maxLag; tau++) {
		let acf = 0;
		let m = 0;
		for (let i = 0; i + tau < n; i++) {
			const a = x[i];
			const b = x[i + tau];
			acf += a * b;
			m += a * a + b * b;
		}
		nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
	}
	// Peaks between positive-going zero crossings; the first one near the
	// highest wins, which keeps octave errors out.
	const peaks: number[] = [];
	let tau = minLag;
	while (tau <= maxLag && nsdf[tau] > 0) tau++; // leave the lag-0 lobe
	while (tau <= maxLag) {
		while (tau <= maxLag && nsdf[tau] <= 0) tau++;
		let best = -1;
		let bestValue = 0;
		while (tau <= maxLag && nsdf[tau] > 0) {
			if (nsdf[tau] > bestValue) {
				bestValue = nsdf[tau];
				best = tau;
			}
			tau++;
		}
		if (best > 0) peaks.push(best);
	}
	if (peaks.length === 0) return null;
	let highest = 0;
	for (const p of peaks) highest = Math.max(highest, nsdf[p]);
	if (highest < minClarity) return null;
	const chosen = peaks.find((p) => nsdf[p] >= highest * 0.93) ?? peaks[0];
	// Parabolic interpolation around the peak, for a fraction of a sample.
	const y0 = nsdf[chosen - 1] ?? nsdf[chosen];
	const y1 = nsdf[chosen];
	const y2 = nsdf[chosen + 1] ?? nsdf[chosen];
	const denom = y0 - 2 * y1 + y2;
	const shift = denom === 0 ? 0 : (0.5 * (y0 - y2)) / denom;
	const period = chosen + Math.max(-1, Math.min(1, shift));
	return { frequency: sampleRate / period, clarity: Math.min(1, y1) };
}

/** The nearest note to a frequency and how far off it is, with A4 at `a4` Hz. */
export function noteFromFrequency(frequency: number, a4 = 440): Note {
	const midiExact = 69 + 12 * Math.log2(frequency / a4);
	const midi = Math.round(midiExact);
	return {
		name: NAMES[((midi % 12) + 12) % 12],
		octave: Math.floor(midi / 12) - 1,
		midi,
		cents: Math.round((midiExact - midi) * 100 * 10) / 10,
	};
}

/** The frequency of a MIDI note with A4 at `a4` Hz. */
export function frequencyOfMidi(midi: number, a4 = 440): number {
	return a4 * 2 ** ((midi - 69) / 12);
}

/** "E2", "F♯3": a note's name with its octave. */
export function noteLabel(midi: number): string {
	return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

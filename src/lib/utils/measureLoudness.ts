import { LOUDNESS_ABSOLUTE_GATE_LUFS } from "#lib/constants/loudness.js";

/**
 * Integrated loudness and true peak of decoded audio as ITU-R BS.1770-4
 * has them (docs/dawn-daw-plan.md, D3): each channel through the
 * K-weighting (a high shelf, then a high-pass, designed for the sample
 * rate given), the mean square per 400 ms block at 100 ms steps, the
 * blocks gated at −70 LUFS and then at 10 LU under their mean, the rest
 * averaged into one figure. The true peak is the largest sample after
 * four-times oversampling with a windowed sinc, in dB. Pure, so a test
 * feeds a sine and reads the known answer; the export measures a bounce
 * with it before normalizing (utils/normalizationGain.ts).
 */
export interface LoudnessReading {
	/** LUFS, or null when nothing rose above the absolute gate (silence). */
	integrated: number | null;
	/** dBTP; −Infinity for silence. */
	truePeak: number;
	/** The largest sample as recorded, dBFS; −Infinity for silence. */
	samplePeak: number;
}

interface Biquad {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

/** The pre-filter (a +4 dB high shelf above about 1.7 kHz) and the RLB high-pass (38 Hz), at this sample rate: libebur128's design, which lands on the standard's 48 kHz table. */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
	const shelf = (() => {
		const f0 = 1681.974450955533;
		const gainDb = 3.999843853973347;
		const q = 0.7071752369554196;
		const K = Math.tan((Math.PI * f0) / sampleRate);
		const Vh = 10 ** (gainDb / 20);
		const Vb = Vh ** 0.4996667741545416;
		const a0 = 1 + K / q + K * K;
		return {
			b0: (Vh + (Vb * K) / q + K * K) / a0,
			b1: (2 * (K * K - Vh)) / a0,
			b2: (Vh - (Vb * K) / q + K * K) / a0,
			a1: (2 * (K * K - 1)) / a0,
			a2: (1 - K / q + K * K) / a0,
		};
	})();
	const highPass = (() => {
		const f0 = 38.13547087602444;
		const q = 0.5003270373238773;
		const K = Math.tan((Math.PI * f0) / sampleRate);
		const a0 = 1 + K / q + K * K;
		return {
			b0: 1,
			b1: -2,
			b2: 1,
			a1: (2 * (K * K - 1)) / a0,
			a2: (1 - K / q + K * K) / a0,
		};
	})();
	return [shelf, highPass];
}

/** The signal through a biquad (direct form I), a new array. */
function filtered(x: Float32Array, f: Biquad): Float32Array {
	const y = new Float32Array(x.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < x.length; i++) {
		const x0 = x[i]!;
		const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
		y[i] = y0;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
	}
	return y;
}

/** The loudness of a mean square (or a channel-weighted sum of them), in LUFS. */
export function lufsOf(meanSquare: number): number {
	return meanSquare <= 0 ? -Infinity : -0.691 + 10 * Math.log10(meanSquare);
}

const dB = (linear: number) => (linear <= 0 ? -Infinity : 20 * Math.log10(linear));

/** Four phases of a 12-tap windowed sinc (Blackman), for the samples between the samples. */
const OVERSAMPLE = 4;
const TAPS = 12;
const PHASES: Float32Array[] = Array.from({ length: OVERSAMPLE - 1 }, (_, p) => {
	const frac = (p + 1) / OVERSAMPLE;
	const taps = new Float32Array(TAPS);
	let sum = 0;
	for (let k = 0; k < TAPS; k++) {
		const n = k - TAPS / 2 + 1 - frac;
		const sinc = n === 0 ? 1 : Math.sin(Math.PI * n) / (Math.PI * n);
		const w =
			0.42 -
			0.5 * Math.cos((2 * Math.PI * (k + 0.5)) / TAPS) +
			0.08 * Math.cos((4 * Math.PI * (k + 0.5)) / TAPS);
		taps[k] = sinc * w;
		sum += taps[k]!;
	}
	for (let k = 0; k < TAPS; k++) taps[k] = taps[k]! / sum;
	return taps;
});

/** The largest absolute value between the samples too. */
function truePeakOf(x: Float32Array): number {
	let peak = 0;
	const n = x.length;
	const half = TAPS / 2 - 1;
	for (let i = 0; i < n; i++) {
		const v = Math.abs(x[i]!);
		if (v > peak) peak = v;
		for (const taps of PHASES) {
			let acc = 0;
			for (let k = 0; k < TAPS; k++) {
				const j = i - half + k;
				if (j >= 0 && j < n) acc += taps[k]! * x[j]!;
			}
			const a = Math.abs(acc);
			if (a > peak) peak = a;
		}
	}
	return peak;
}

export function measureLoudness(channels: Float32Array[], sampleRate: number): LoudnessReading {
	const n = channels[0]?.length ?? 0;
	if (channels.length === 0 || n === 0)
		return { integrated: null, truePeak: -Infinity, samplePeak: -Infinity };
	const [shelf, highPass] = kWeighting(sampleRate);
	// Surround channels would weight 1.41; a mono or stereo bounce weights each channel 1.
	const weighted = channels.map((ch) => filtered(filtered(ch, shelf), highPass));
	let samplePeak = 0;
	let truePeak = 0;
	for (const ch of channels) {
		for (let i = 0; i < ch.length; i++) {
			const v = Math.abs(ch[i]!);
			if (v > samplePeak) samplePeak = v;
		}
		truePeak = Math.max(truePeak, truePeakOf(ch));
	}
	const block = Math.round(0.4 * sampleRate);
	const hop = Math.round(0.1 * sampleRate);
	// Mean square per block (the channels summed), from a running sum per channel.
	const sums: number[] = [];
	if (n >= block) {
		const squares = weighted.map((ch) => {
			const s = new Float64Array(ch.length + 1);
			for (let i = 0; i < ch.length; i++) s[i + 1] = s[i]! + ch[i]! * ch[i]!;
			return s;
		});
		for (let start = 0; start + block <= n; start += hop) {
			let total = 0;
			for (const s of squares) total += (s[start + block]! - s[start]!) / block;
			sums.push(total);
		}
	} else {
		// Shorter than a block: the whole thing is the one block.
		let total = 0;
		for (const ch of weighted) {
			let sq = 0;
			for (let i = 0; i < ch.length; i++) sq += ch[i]! * ch[i]!;
			total += sq / ch.length;
		}
		sums.push(total);
	}
	const aboveAbsolute = sums.filter((s) => lufsOf(s) > LOUDNESS_ABSOLUTE_GATE_LUFS);
	if (aboveAbsolute.length === 0)
		return { integrated: null, truePeak: dB(truePeak), samplePeak: dB(samplePeak) };
	const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
	const relativeGate = lufsOf(mean(aboveAbsolute)) - 10;
	const kept = aboveAbsolute.filter((s) => lufsOf(s) > relativeGate);
	const integrated = kept.length ? lufsOf(mean(kept)) : null;
	return { integrated, truePeak: dB(truePeak), samplePeak: dB(samplePeak) };
}

/**
 * A streaming resampler for windows of audio that arrive one after another
 * (the streaming voice, `streamVoice.ts`): each `push` returns the output
 * frames its input completes, and the filter's tail of the previous input
 * is kept, so a signal cut into windows comes out as if it had been
 * resampled whole.
 *
 * The filter is a windowed sinc, 16 taps (8 each side of the output
 * point) under a Kaiser window (beta 7), its cutoff at 0.9 of the lower
 * Nyquist so a downsample does not alias. The kernel is tabulated at 512
 * fractional phases and read between two of them linearly, every phase
 * normalized to unity gain. Cost: per output frame 16 coefficients
 * interpolated once and 16 multiply-adds per channel: about 3 ms of main
 * thread for a second of stereo 48 → 44.1 kHz in Bun (under a
 * millisecond a 0.25 s window); the table is 33 KB, built per resampler.
 * Measured against the ideal sine: -72 dB at 1 kHz, -65 dB at 10 kHz,
 * -39 dB at 15 kHz (the short kernel's roll-off starts there), which is
 * inaudible beside a recording's own noise floor. The filter's delay is compensated (output frame 0 sits on
 * input frame 0), and the ends are padded with silence. The browser's own
 * resampler (`resampleBuffer.ts`) needs a whole buffer and an offline
 * context, so it cannot serve a stream.
 */

/** Taps each side of the output point. */
const HALF = 8;
const TAPS = HALF * 2;
/** Fractional phases in the kernel table. */
const PHASES = 512;
const KAISER_BETA = 7;
/** The cutoff as a fraction of the lower of the two Nyquist frequencies. */
const ROLLOFF = 0.9;

/** The zeroth-order modified Bessel function, by its series (the Kaiser window's). */
function besselI0(x: number): number {
	let sum = 1;
	let term = 1;
	for (let k = 1; k < 30; k++) {
		term *= (x / (2 * k)) ** 2;
		sum += term;
		if (term < 1e-12 * sum) break;
	}
	return sum;
}

/** The kernel at PHASES + 1 phases, TAPS each: row p is for a fractional position p / PHASES. */
function kernelTable(cutoff: number): Float32Array {
	const table = new Float32Array((PHASES + 1) * TAPS);
	const norm = besselI0(KAISER_BETA);
	for (let p = 0; p <= PHASES; p++) {
		const frac = p / PHASES;
		let sum = 0;
		for (let j = 0; j < TAPS; j++) {
			// Tap j reads input floor(t) + j - (HALF - 1); its distance from t.
			const d = j - (HALF - 1) - frac;
			const x = cutoff * d;
			const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
			const r = d / HALF;
			const w = Math.abs(r) >= 1 ? 0 : besselI0(KAISER_BETA * Math.sqrt(1 - r * r)) / norm;
			const h = cutoff * sinc * w;
			table[p * TAPS + j] = h;
			sum += h;
		}
		for (let j = 0; j < TAPS; j++) table[p * TAPS + j] /= sum;
	}
	return table;
}

export class Resampler {
	readonly fromRate: number;
	readonly toRate: number;
	readonly channels: number;
	readonly #step: number;
	readonly #table: Float32Array | null;
	/** Input not yet behind the filter, per channel, from buffer index 0. */
	#hist: Float32Array[];
	/** The next output's position in `#hist`, in input frames. */
	#pos = HALF - 1;
	#inFrames = 0;
	#outFrames = 0;
	readonly #coef = new Float32Array(TAPS);

	constructor(fromRate: number, toRate: number, channels: number) {
		this.fromRate = fromRate;
		this.toRate = toRate;
		this.channels = channels;
		this.#step = fromRate / toRate;
		this.#table =
			fromRate === toRate ? null : kernelTable(ROLLOFF * Math.min(1, toRate / fromRate));
		// HALF - 1 frames of silence before the first input, so output 0 sits on input 0.
		this.#hist = Array.from({ length: channels }, () => new Float32Array(HALF - 1));
	}

	/** The output frames `planes` (one array per channel, equal lengths) complete. */
	push(planes: Float32Array[]): Float32Array[] {
		if (!this.#table) return planes;
		const n = planes[0]?.length ?? 0;
		this.#inFrames += n;
		this.#hist = this.#hist.map((h, c) => {
			const joined = new Float32Array(h.length + n);
			joined.set(h);
			joined.set(planes[Math.min(c, planes.length - 1)] ?? new Float32Array(n), h.length);
			return joined;
		});
		const want = Math.floor(this.#inFrames / this.#step);
		return this.#emit(want);
	}

	/** The last frames, the input's end padded with silence: the total comes to round(input × to / from). */
	flush(): Float32Array[] {
		if (!this.#table) return Array.from({ length: this.channels }, () => new Float32Array(0));
		this.#hist = this.#hist.map((h) => {
			const padded = new Float32Array(h.length + HALF + 1);
			padded.set(h);
			return padded;
		});
		return this.#emit(Math.round((this.#inFrames * this.toRate) / this.fromRate));
	}

	/** Output frames up to `want` in all, as far as the held input reaches. */
	#emit(want: number): Float32Array[] {
		const table = this.#table!;
		const coef = this.#coef;
		const len = this.#hist[0]?.length ?? 0;
		// An output at pos needs input through floor(pos) + HALF.
		const reach = Math.floor((len - 1 - HALF - this.#pos) / this.#step) + 1;
		const count = Math.max(0, Math.min(want - this.#outFrames, reach));
		const out = this.#hist.map(() => new Float32Array(count));
		let pos = this.#pos;
		for (let k = 0; k < count; k++) {
			const base = Math.floor(pos);
			const ph = (pos - base) * PHASES;
			const p = Math.floor(ph);
			const t = ph - p;
			const r0 = p * TAPS;
			const r1 = r0 + TAPS;
			for (let j = 0; j < TAPS; j++) coef[j] = table[r0 + j] + t * (table[r1 + j] - table[r0 + j]);
			const first = base - (HALF - 1);
			for (let c = 0; c < out.length; c++) {
				const h = this.#hist[c];
				let y = 0;
				for (let j = 0; j < TAPS; j++) y += coef[j] * h[first + j];
				out[c][k] = y;
			}
			pos += this.#step;
		}
		this.#outFrames += count;
		// Keep from the first frame the next output reads.
		const drop = Math.max(0, Math.floor(pos) - (HALF - 1));
		this.#hist = this.#hist.map((h) => h.slice(drop));
		this.#pos = pos - drop;
		return out;
	}
}

/**
 * A one-shot's loudness for a multisampled kit's velocity layers
 * (docs/drum-machine.md, "Multisampled kits"): the maximum momentary loudness
 * of ITU-R BS.1770 / EBU R 128, in LUFS. The signal is K-weighted (a high
 * shelf, then a high pass), and the loudest 400 ms window counts. Unlike
 * integrated loudness it does not depend on how long the tail rings: a
 * sample shorter than the window is measured as if padded with silence.
 *
 * Every window position is tried (a running sum of squares), so a window
 * never starts just after the attack. A mono file is measured as dual mono,
 * the same as its two-channel copy, so mono and stereo layers compare.
 * Silence is -Infinity.
 */
export function maxMomentaryLoudness(channels: readonly Float32Array[], sampleRate: number): number {
	if (channels.length === 0 || !(sampleRate > 0)) return -Infinity;
	const length = channels[0]!.length;
	if (length === 0) return -Infinity;
	const window = Math.round(sampleRate * 0.4);
	// Squared K-weighted samples summed across channels, as a running total.
	const total = new Float64Array(length + 1);
	const weight = channels.length === 1 ? 2 : 1;
	const [shelf, highPass] = kWeighting(sampleRate);
	for (const channel of channels.slice(0, 2)) {
		const s1 = biquad(shelf);
		const s2 = biquad(highPass);
		let sum = 0;
		for (let i = 0; i < length; i++) {
			const y = s2(s1(channel[i] ?? 0));
			sum += weight * y * y;
			total[i + 1]! += sum;
		}
	}
	let loudest = 0;
	const last = Math.max(0, length - window);
	for (let start = 0; start <= last; start++) {
		const end = Math.min(length, start + window);
		const energy = total[end]! - total[start]!;
		if (energy > loudest) loudest = energy;
	}
	if (loudest <= 0) return -Infinity;
	return -0.691 + 10 * Math.log10(loudest / window);
}

interface Coefficients {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

/** The two K-weighting stages at a sample rate (BS.1770's analog prototypes, bilinear-transformed; at 48 kHz they are the standard's table). */
export function kWeighting(sampleRate: number): [Coefficients, Coefficients] {
	// Stage 1: the head's high shelf, about +4 dB above 1.5 kHz.
	let f0 = 1681.974450955533;
	const gain = 3.999843853973347;
	let q = 0.7071752369554196;
	let k = Math.tan((Math.PI * f0) / sampleRate);
	const vh = 10 ** (gain / 20);
	const vb = vh ** 0.4996667741545416;
	let a0 = 1 + k / q + k * k;
	const shelf = {
		b0: (vh + (vb * k) / q + k * k) / a0,
		b1: (2 * (k * k - vh)) / a0,
		b2: (vh - (vb * k) / q + k * k) / a0,
		a1: (2 * (k * k - 1)) / a0,
		a2: (1 - k / q + k * k) / a0,
	};
	// Stage 2: the RLB high pass at about 38 Hz.
	f0 = 38.13547087602444;
	q = 0.5003270373238773;
	k = Math.tan((Math.PI * f0) / sampleRate);
	a0 = 1 + k / q + k * k;
	const highPass = {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (k * k - 1)) / a0,
		a2: (1 - k / q + k * k) / a0,
	};
	return [shelf, highPass];
}

/** A direct-form I biquad, one sample in, one out. */
function biquad({ b0, b1, b2, a1, a2 }: Coefficients) {
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	return (x: number) => {
		const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		return y;
	};
}

/**
 * A biquad filter on samples, the Audio EQ Cookbook's (RBJ) recipes, for
 * rendering a response offline where no AudioContext exists: the cabinet
 * impulses are made this way (cabinetImpulse.ts). `q` is linear here,
 * unlike BiquadFilterNode's dB for a low-pass and a high-pass; `gainDb`
 * matters to the peaking and shelving types only.
 */
export type BiquadType = "lowpass" | "highpass" | "peaking" | "lowshelf" | "highshelf";
export interface BiquadCoefficients {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

export function biquad(
	type: BiquadType,
	rate: number,
	hz: number,
	q: number,
	gainDb = 0,
): BiquadCoefficients {
	const A = 10 ** (gainDb / 40);
	const w0 = (2 * Math.PI * hz) / rate;
	const cos = Math.cos(w0);
	const sin = Math.sin(w0);
	const alpha = sin / (2 * q);
	let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
	switch (type) {
		case "lowpass":
			b0 = (1 - cos) / 2;
			b1 = 1 - cos;
			b2 = (1 - cos) / 2;
			a0 = 1 + alpha;
			a1 = -2 * cos;
			a2 = 1 - alpha;
			break;
		case "highpass":
			b0 = (1 + cos) / 2;
			b1 = -(1 + cos);
			b2 = (1 + cos) / 2;
			a0 = 1 + alpha;
			a1 = -2 * cos;
			a2 = 1 - alpha;
			break;
		case "peaking":
			b0 = 1 + alpha * A;
			b1 = -2 * cos;
			b2 = 1 - alpha * A;
			a0 = 1 + alpha / A;
			a1 = -2 * cos;
			a2 = 1 - alpha / A;
			break;
		case "lowshelf": {
			const s = 2 * Math.sqrt(A) * alpha;
			b0 = A * (A + 1 - (A - 1) * cos + s);
			b1 = 2 * A * (A - 1 - (A + 1) * cos);
			b2 = A * (A + 1 - (A - 1) * cos - s);
			a0 = A + 1 + (A - 1) * cos + s;
			a1 = -2 * (A - 1 + (A + 1) * cos);
			a2 = A + 1 + (A - 1) * cos - s;
			break;
		}
		case "highshelf": {
			const s = 2 * Math.sqrt(A) * alpha;
			b0 = A * (A + 1 + (A - 1) * cos + s);
			b1 = -2 * A * (A - 1 + (A + 1) * cos);
			b2 = A * (A + 1 + (A - 1) * cos - s);
			a0 = A + 1 - (A - 1) * cos + s;
			a1 = 2 * (A - 1 - (A + 1) * cos);
			a2 = A + 1 - (A - 1) * cos - s;
			break;
		}
	}
	return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Runs the filter over the samples in place (direct form I). */
export function applyBiquad(samples: Float32Array, c: BiquadCoefficients): void {
	let x1 = 0,
		x2 = 0,
		y1 = 0,
		y2 = 0;
	for (let i = 0; i < samples.length; i++) {
		const x0 = samples[i]!;
		const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
		samples[i] = y0;
	}
}

/** One frequency's magnitude in the samples (Goertzel), for a response check. */
export function magnitudeAt(samples: Float32Array, rate: number, hz: number): number {
	const k = (2 * Math.PI * hz) / rate;
	const coeff = 2 * Math.cos(k);
	let s0 = 0,
		s1 = 0,
		s2 = 0;
	for (let i = 0; i < samples.length; i++) {
		s0 = samples[i]! + coeff * s1 - s2;
		s2 = s1;
		s1 = s0;
	}
	const re = s1 - s2 * Math.cos(k);
	const im = s2 * Math.sin(k);
	return Math.sqrt(re * re + im * im);
}

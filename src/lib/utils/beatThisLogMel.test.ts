import { describe, expect, test } from "vite-plus/test";
import { beatThisLogMel } from "./beatThisLogMel";
import { beatThisMelBank } from "./beatThisMelBank";

const SR = 22050;

function cosine(length: number, hz: number, amplitude = 1): Float32Array {
	return Float32Array.from({ length }, (_, n) => amplitude * Math.cos((2 * Math.PI * hz * n) / SR));
}

/** The mel row of frame `f`. */
function row(data: Float32Array, f: number): Float32Array {
	return data.subarray(f * 128, (f + 1) * 128);
}

describe("beatThisLogMel", () => {
	test("shape: 1 + floor(length / 441) frames of 128 bands", () => {
		const one = beatThisLogMel(new Float32Array(SR));
		expect(one.frames).toBe(51);
		expect(one.mels).toBe(128);
		expect(one.data).toHaveLength(51 * 128);
		expect(beatThisLogMel(new Float32Array(440)).frames).toBe(1);
		expect(beatThisLogMel(new Float32Array(882)).frames).toBe(3);
	});
	test("silence is all zeros", () => {
		const { data } = beatThisLogMel(new Float32Array(5000));
		expect(data.every((v) => v === 0)).toBe(true);
	});
	test("a tone at a band's center peaks in that band", () => {
		// Band 80's center is its middle corner, f_pts[81].
		const mMin = 0.45;
		const mMax = 15 + Math.log(11) / (Math.log(6.4) / 27);
		const mel = mMin + ((mMax - mMin) * 81) / 129;
		const hz = 1000 * Math.exp((Math.log(6.4) / 27) * (mel - 15));
		const { data } = beatThisLogMel(cosine(SR, hz));
		const r = row(data, 25);
		let best = 0;
		for (let m = 1; m < 128; m++) if (r[m] > r[best]) best = m;
		expect(best).toBe(80);
	});
	test("normalization: a cosine on bin k gives |X| = 256/32 there and 128/32 beside it", () => {
		// A periodic Hann window sums to N/2 = 512, so a unit cosine exactly on
		// bin k has |X[k]| = 512/2 = 256 and leaks |X[k±1]| = 128 (the window's
		// own DFT is N/2, −N/4, −N/4), whatever its phase. torch.stft's
		// normalized=True divides by sqrt(1024) = 32: 8 and 4.
		const k = 100;
		const hz = (k * SR) / 1024;
		const { data } = beatThisLogMel(cosine(SR, hz));
		const r = row(data, 20);
		const bank = beatThisMelBank();
		const mag = (bin: number) => (bin === k ? 8 : Math.abs(bin - k) === 1 ? 4 : 0);
		for (let m = 0; m < 128; m++) {
			const { start, weights } = bank[m];
			let sum = 0;
			weights.forEach((w, q) => (sum += w * mag(start + q)));
			// Float32 samples leak a little energy elsewhere: 1e-3 is ample.
			expect(r[m]).toBeCloseTo(Math.log1p(1000 * sum), 3);
		}
	});
	test("centered frames: frame 0 sees the reflected start", () => {
		// A click at sample 100 reflects to sample −100, both in frame 0.
		const x = new Float32Array(2000);
		x[100] = 1;
		const { data } = beatThisLogMel(x);
		expect(row(data, 0).some((v) => v > 0)).toBe(true);
		// Frame 3 starts at 3·441 − 512 = 811, past the click.
		expect(row(data, 3).every((v) => v === 0)).toBe(true);
	});
});

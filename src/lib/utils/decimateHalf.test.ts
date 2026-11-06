import { describe, expect, test } from "vite-plus/test";
import { decimateHalf } from "./decimateHalf";
import { kaiserHalfBand } from "./kaiserHalfBand";

const RATE = 22050;

function tone(hz: number, seconds = 1): Float32Array {
	const out = new Float32Array(RATE * seconds);
	for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / RATE);
	return out;
}

/** Peak amplitude away from the edges (where the zero padding tapers the filter). */
function innerPeak(y: Float64Array): number {
	let peak = 0;
	for (let i = 500; i < y.length - 500; i++) peak = Math.max(peak, Math.abs(y[i]));
	return peak;
}

describe("decimateHalf", () => {
	const taps = kaiserHalfBand();
	test("returns ceil(length / 2) samples", () => {
		expect(decimateHalf(new Float32Array(11), taps).length).toBe(6);
		expect(decimateHalf(new Float32Array(10), taps).length).toBe(5);
	});
	test("keeps a 440 Hz tone, scaled by √2", () => {
		expect(innerPeak(decimateHalf(tone(440), taps))).toBeCloseTo(Math.SQRT2, 2);
	});
	test("attenuates a tone at 0.49 of the input Nyquist", () => {
		expect(innerPeak(decimateHalf(tone(0.49 * (RATE / 2)), taps))).toBeLessThan(0.75);
	});
});

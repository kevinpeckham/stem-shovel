import { describe, expect, it } from "vite-plus/test";
import { applyBiquad, biquad, magnitudeAt } from "./biquad";

const RATE = 48000;
function response(
	type: Parameters<typeof biquad>[0],
	hz: number,
	q: number,
	db: number,
	at: number,
) {
	const x = new Float32Array(RATE);
	x[0] = 1;
	applyBiquad(x, biquad(type, RATE, hz, q, db));
	return 20 * Math.log10(magnitudeAt(x, RATE, at));
}

describe("biquad", () => {
	it("a low-pass is flat below its corner and 3 dB down at it", () => {
		expect(response("lowpass", 1000, Math.SQRT1_2, 0, 100)).toBeCloseTo(0, 1);
		expect(response("lowpass", 1000, Math.SQRT1_2, 0, 1000)).toBeCloseTo(-3, 0);
		expect(response("lowpass", 1000, Math.SQRT1_2, 0, 10000)).toBeLessThan(-35);
	});
	it("a peaking filter lifts its centre by its gain and leaves the far bands alone", () => {
		expect(response("peaking", 1000, 1, 6, 1000)).toBeCloseTo(6, 0);
		expect(response("peaking", 1000, 1, 6, 50)).toBeCloseTo(0, 0);
	});
	it("the shelves move their side by the gain", () => {
		expect(response("lowshelf", 200, 1, -6, 30)).toBeCloseTo(-6, 0);
		expect(response("lowshelf", 200, 1, -6, 5000)).toBeCloseTo(0, 0);
		expect(response("highshelf", 2000, 1, 6, 15000)).toBeCloseTo(6, 0);
		expect(response("highshelf", 2000, 1, 6, 100)).toBeCloseTo(0, 0);
	});
});

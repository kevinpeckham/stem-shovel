import { describe, expect, it } from "vite-plus/test";
import { magnitudeAt } from "./biquad";
import { cabinetImpulseSamples } from "./cabinetImpulse";

const RATE = 48000;
/** The response at a frequency, the impulse padded to a second so the measurement resolves a hertz. */
const db = (s: Float32Array, hz: number) => {
	const padded = new Float32Array(RATE);
	padded.set(s);
	return 20 * Math.log10(magnitudeAt(padded, RATE, hz));
};

describe("cabinetImpulseSamples", () => {
	it("a guitar cabinet passes the body at unity, rolls off above its cone and below its box", () => {
		const s = cabinetImpulseSamples("open-2x12", RATE);
		expect(s.length).toBe(2400);
		expect(db(s, 500)).toBeCloseTo(0, 0);
		expect(db(s, 10000)).toBeLessThan(-15);
		expect(db(s, 30)).toBeLessThan(-12);
		expect(Math.abs(s[s.length - 1]!)).toBeLessThan(1e-3);
	});
	it("the bass cabinets keep more bottom and less top than the guitar ones", () => {
		const fridge = cabinetImpulseSamples("fridge-8x10", RATE);
		const twelve = cabinetImpulseSamples("open-2x12", RATE);
		expect(db(fridge, 60)).toBeGreaterThan(db(twelve, 60) + 6);
		expect(db(fridge, 6000)).toBeLessThan(db(twelve, 6000));
		const combo = cabinetImpulseSamples("combo-4x10", RATE);
		expect(db(combo, 7000)).toBeGreaterThan(db(fridge, 7000) + 10);
	});
});

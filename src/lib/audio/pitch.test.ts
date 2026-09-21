import { describe, expect, test } from "vite-plus/test";
import { detectPitch, frequencyOfMidi, noteFromFrequency, noteLabel } from "./pitch";

const RATE = 48000;
/** A tone with a few harmonics, like a plucked string, `seconds` long. */
function tone(hz: number, seconds = 0.05, harmonics = [1, 0.5, 0.25]): Float32Array {
	const n = Math.round(RATE * seconds);
	const x = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const t = i / RATE;
		harmonics.forEach((a, k) => (x[i] += a * Math.sin(2 * Math.PI * hz * (k + 1) * t)));
	}
	return x;
}

describe("detectPitch", () => {
	test("guitar strings, standard tuning, within a cent", () => {
		for (const [name, hz] of [
			["E2", 82.41],
			["A2", 110],
			["D3", 146.83],
			["G3", 196],
			["B3", 246.94],
			["E4", 329.63],
		] as const) {
			const p = detectPitch(tone(hz), RATE);
			expect(p, name).not.toBeNull();
			const cents = 1200 * Math.log2((p?.frequency ?? 1) / hz);
			expect(Math.abs(cents), `${name} read ${p?.frequency}`).toBeLessThan(1);
			expect(p?.clarity ?? 0).toBeGreaterThan(0.9);
		}
	});
	test("a bass low E and a high fret still read", () => {
		expect(
			Math.abs(1200 * Math.log2((detectPitch(tone(41.2), RATE)?.frequency ?? 1) / 41.2)),
		).toBeLessThan(2);
		expect(
			Math.abs(1200 * Math.log2((detectPitch(tone(880), RATE)?.frequency ?? 1) / 880)),
		).toBeLessThan(1);
	});
	test("silence and noise read as nothing", () => {
		expect(detectPitch(new Float32Array(2048), RATE)).toBeNull();
		const noise = new Float32Array(2048);
		let seed = 1;
		for (let i = 0; i < noise.length; i++) {
			seed = (seed * 16807) % 2147483647;
			noise[i] = seed / 2147483647 - 0.5;
		}
		expect(detectPitch(noise, RATE)).toBeNull();
	});
});

describe("noteFromFrequency", () => {
	test("names, octaves and cents", () => {
		expect(noteFromFrequency(440)).toEqual({ name: "A", octave: 4, midi: 69, cents: 0 });
		expect(noteFromFrequency(82.41).name).toBe("E");
		expect(noteFromFrequency(82.41).octave).toBe(2);
		expect(noteFromFrequency(445).cents).toBeCloseTo(19.6, 0);
		expect(noteFromFrequency(435).cents).toBeCloseTo(-19.8, 0);
		expect(noteFromFrequency(370).name).toBe("F♯");
	});
	test("a different reference pitch moves the grid", () => {
		expect(noteFromFrequency(432, 432).cents).toBe(0);
		expect(frequencyOfMidi(69, 442)).toBe(442);
		expect(noteLabel(40)).toBe("E2");
	});
});

import { describe, expect, it } from "vite-plus/test";
import { kWeighting, lufsOf, measureLoudness } from "./measureLoudness";

const sine = (
	seconds: number,
	sampleRate: number,
	hz: number,
	amplitude: number,
	phase = 0,
): Float32Array => {
	const out = new Float32Array(Math.round(seconds * sampleRate));
	for (let i = 0; i < out.length; i++)
		out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate + phase);
	return out;
};
const dBFS = (db: number) => 10 ** (db / 20);

describe("measureLoudness", () => {
	it("designs the K-weighting the standard tabulates for 48 kHz", () => {
		const [shelf, highPass] = kWeighting(48000);
		expect(shelf.b0).toBeCloseTo(1.53512485958697, 6);
		expect(shelf.b1).toBeCloseTo(-2.69169618940638, 6);
		expect(shelf.b2).toBeCloseTo(1.19839281085285, 6);
		expect(shelf.a1).toBeCloseTo(-1.69065929318241, 6);
		expect(shelf.a2).toBeCloseTo(0.73248077421585, 6);
		expect(highPass.b0).toBeCloseTo(1, 6);
		expect(highPass.b1).toBeCloseTo(-2, 6);
		expect(highPass.a1).toBeCloseTo(-1.99004745483398, 6);
		expect(highPass.a2).toBeCloseTo(0.99007225036621, 6);
	});
	it("reads a −20 dBFS 1 kHz sine at −23 LUFS in mono and −20 in stereo, at either common rate", () => {
		for (const rate of [48000, 44100]) {
			const mono = measureLoudness([sine(3, rate, 1000, dBFS(-20))], rate);
			expect(mono.integrated).toBeCloseTo(-23.01, 1);
			expect(mono.samplePeak).toBeCloseTo(-20, 1);
			const stereo = measureLoudness(
				[sine(3, rate, 1000, dBFS(-20)), sine(3, rate, 1000, dBFS(-20))],
				rate,
			);
			expect(stereo.integrated).toBeCloseTo(-20, 1);
		}
	});
	it("is silence when nothing rises above the absolute gate", () => {
		expect(measureLoudness([new Float32Array(48000)], 48000)).toEqual({
			integrated: null,
			truePeak: -Infinity,
			samplePeak: -Infinity,
		});
		expect(measureLoudness([sine(2, 48000, 1000, dBFS(-90))], 48000).integrated).toBeNull();
		expect(measureLoudness([], 48000).integrated).toBeNull();
	});
	it("gates the silence out: a tone then a pause reads as the tone", () => {
		const tone = sine(2, 48000, 1000, dBFS(-20));
		const both = new Float32Array(4 * 48000);
		both.set(tone, 0);
		// The blocks straddling the edge are part tone and pass the gates: a few tenths under the tone alone.
		expect(measureLoudness([both], 48000).integrated).toBeCloseTo(-23.2, 0);
	});
	it("gates a quiet passage out at 10 LU under the rest, but keeps one within it", () => {
		const loud = sine(4, 48000, 1000, dBFS(-20));
		const quiet = sine(4, 48000, 1000, dBFS(-40));
		const mid = sine(4, 48000, 1000, dBFS(-26));
		const a = new Float32Array(8 * 48000);
		a.set(loud, 0);
		a.set(quiet, loud.length);
		expect(measureLoudness([a], 48000).integrated).toBeCloseTo(-23.1, 0);
		const b = new Float32Array(8 * 48000);
		b.set(loud, 0);
		b.set(mid, loud.length);
		const r = measureLoudness([b], 48000).integrated!;
		expect(r).toBeLessThan(-23.5);
		expect(r).toBeGreaterThan(-27);
	});
	it("finds the true peak between the samples", () => {
		// A quarter-rate sine sampled at 45°: every sample sits at 0.707, the wave peaks at 1 between them.
		const x = sine(1, 48000, 12000, 1, Math.PI / 4);
		const r = measureLoudness([x], 48000);
		expect(r.samplePeak).toBeCloseTo(-3.01, 1);
		expect(r.truePeak).toBeGreaterThan(-0.4);
		expect(r.truePeak).toBeLessThan(0.3);
		// A low tone's true peak is its sample peak.
		const low = measureLoudness([sine(1, 48000, 100, 0.5)], 48000);
		expect(low.truePeak).toBeCloseTo(-6.02, 1);
	});
	it("takes a clip shorter than a block as one block", () => {
		expect(measureLoudness([sine(0.2, 48000, 1000, dBFS(-20))], 48000).integrated).toBeCloseTo(
			-23.01,
			0,
		);
	});
	it("lufsOf turns a mean square into LUFS", () => {
		expect(lufsOf(0)).toBe(-Infinity);
		expect(lufsOf(1)).toBeCloseTo(-0.691, 3);
	});
});

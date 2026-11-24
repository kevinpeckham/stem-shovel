import { describe, expect, it } from "vite-plus/test";
import { kWeighting, maxMomentaryLoudness } from "./maxMomentaryLoudness";

/** A sine at `dbfs` peak level, `seconds` long, then `silence` seconds of zeros. */
function sine(sampleRate: number, dbfs: number, seconds: number, silence = 0, hz = 997) {
	const amp = 10 ** (dbfs / 20);
	const n = Math.round(sampleRate * seconds);
	const out = new Float32Array(n + Math.round(sampleRate * silence));
	for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sampleRate);
	return out;
}

describe("kWeighting", () => {
	it("at 48 kHz, the coefficients of ITU-R BS.1770's table", () => {
		const [shelf, highPass] = kWeighting(48000);
		expect(shelf.b0).toBeCloseTo(1.53512485958697, 10);
		expect(shelf.b1).toBeCloseTo(-2.69169618940638, 10);
		expect(shelf.b2).toBeCloseTo(1.19839281085285, 10);
		expect(shelf.a1).toBeCloseTo(-1.69065929318241, 10);
		expect(shelf.a2).toBeCloseTo(0.73248077421585, 10);
		expect(highPass.a1).toBeCloseTo(-1.99004745483398, 10);
		expect(highPass.a2).toBeCloseTo(0.99007225036621, 10);
	});
});

describe("maxMomentaryLoudness", () => {
	it("EBU Tech 3341's reference: a stereo 1 kHz sine at -23 dBFS reads -23 LUFS", () => {
		const s = sine(48000, -23, 2);
		expect(maxMomentaryLoudness([s, s], 48000)).toBeCloseTo(-23, 1);
	});
	it("at 44.1 kHz too", () => {
		const s = sine(44100, -23, 2);
		expect(maxMomentaryLoudness([s, s], 44100)).toBeCloseTo(-23, 1);
	});
	it("a mono file reads as its dual-mono stereo copy", () => {
		const s = sine(48000, -18, 1);
		expect(maxMomentaryLoudness([s], 48000)).toBeCloseTo(maxMomentaryLoudness([s, s], 48000), 6);
	});
	it("a hit shorter than the window counts as padded with silence: 40 ms reads 10 dB under 400 ms", () => {
		const long = sine(48000, -20, 0.4);
		const short = sine(48000, -20, 0.04);
		const a = maxMomentaryLoudness([long, long], 48000);
		const b = maxMomentaryLoudness([short, short], 48000);
		expect(a - b).toBeCloseTo(10, 1);
	});
	it("the tail's length does not move it: the same hit with 3 s of silence after reads the same", () => {
		// Within a hundredth of a dB: the filters ring a little into the silence, as they should.
		const hit = sine(48000, -12, 0.1);
		const padded = sine(48000, -12, 0.1, 3);
		expect(maxMomentaryLoudness([padded, padded], 48000)).toBeCloseTo(
			maxMomentaryLoudness([hit, hit], 48000),
			2,
		);
	});
	it("the loudest window wins, wherever it sits", () => {
		const quiet = sine(48000, -40, 1);
		const loud = sine(48000, -10, 0.5);
		const both = new Float32Array(quiet.length + loud.length);
		both.set(quiet);
		both.set(loud, quiet.length);
		expect(maxMomentaryLoudness([both, both], 48000)).toBeCloseTo(-10, 1);
	});
	it("6 dB quieter in, 6 dB quieter out", () => {
		const a = sine(48000, -10, 0.5);
		const b = sine(48000, -16, 0.5);
		expect(
			maxMomentaryLoudness([a, a], 48000) - maxMomentaryLoudness([b, b], 48000),
		).toBeCloseTo(6, 2);
	});
	it("silence and nothing are -Infinity", () => {
		expect(maxMomentaryLoudness([new Float32Array(48000)], 48000)).toBe(-Infinity);
		expect(maxMomentaryLoudness([], 48000)).toBe(-Infinity);
		expect(maxMomentaryLoudness([new Float32Array(0)], 48000)).toBe(-Infinity);
	});
});

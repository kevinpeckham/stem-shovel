import { describe, expect, it } from "vite-plus/test";
import { detectTempo } from "./detectTempo";

/** Clicks (short decaying bursts) every beat at a tempo, `seconds` long. */
function clickTrack(
	bpm: number,
	seconds: number,
	sampleRate = 44100,
	accentEvery = 0,
): Float32Array {
	const out = new Float32Array(Math.round(seconds * sampleRate));
	const beat = (60 / bpm) * sampleRate;
	let k = 0;
	for (let start = 0; start < out.length; start += beat, k++) {
		const amp = accentEvery && k % accentEvery === 0 ? 1 : 0.6;
		for (let i = 0; i < 2000 && Math.round(start) + i < out.length; i++)
			out[Math.round(start) + i] = amp * Math.exp(-i / 400) * Math.sin(i * 0.3);
	}
	return out;
}

describe("detectTempo", () => {
	it("finds the tempo of a click track", () => {
		expect(detectTempo([clickTrack(120, 8)], 44100)).toBeCloseTo(120, 0);
		expect(detectTempo([clickTrack(93, 10)], 44100)).toBeCloseTo(93, 0);
	});
	it("folds a fast reading into the comfortable range", () => {
		const bpm = detectTempo([clickTrack(200, 8, 44100, 2)], 44100)!;
		expect(bpm).toBeGreaterThanOrEqual(70);
		expect(bpm).toBeLessThanOrEqual(180);
		expect(Math.abs(bpm - 100) < 1 || Math.abs(bpm - 200) < 1).toBe(true);
	});
	it("is null for silence or a clip too short", () => {
		expect(detectTempo([new Float32Array(44100 * 4)], 44100)).toBeNull();
		expect(detectTempo([clickTrack(120, 1)], 44100)).toBeNull();
		expect(detectTempo([], 44100)).toBeNull();
	});
});

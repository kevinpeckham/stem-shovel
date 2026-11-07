import { describe, expect, test } from "vite-plus/test";
import plan from "#lib/server/chordmini/cqt-plan.json";
import config from "#lib/server/chordmini/config.json";
import fixture from "./chordminiCqt.fixture.json";
import { chordminiFeatures } from "./chordminiCqt";
import { chordminiRunsOf } from "./chordminiRunsOf";

/** The fixture's synthetic clip, rebuilt from its description. */
function fixtureSignal(): Float32Array {
	const { sampleRate, seconds, peak, chords, harmonics } = fixture.signal;
	const x = new Float64Array(sampleRate * seconds);
	for (let i = 0; i < x.length; i++) {
		const t = i / sampleRate;
		for (const chord of chords) {
			if (t < chord.from || t >= chord.to) continue;
			for (const hz of chord.hz)
				for (const k of harmonics) x[i] += Math.sin(2 * Math.PI * hz * k * t) / k;
		}
	}
	let max = 0;
	for (const v of x) max = Math.max(max, Math.abs(v));
	return Float32Array.from(x, (v) => (v / max) * peak);
}

describe("chordminiFeatures", () => {
	test("matches the Python reference on the synthetic clip", () => {
		const { frames, features } = chordminiFeatures(fixtureSignal(), plan);
		expect(frames).toBe(65);
		expect(features.length).toBe(65 * 144);
		// Bins whose reference magnitude is under 1e-3 (the two lowest octaves, where the clip
		// is silent) are the reference's float32 rounding noise and soxr's stopband, not signal:
		// they hold to 0.5 and the mean, the rest to 0.02.
		const floor = Math.log(1e-3);
		let maxDiff = 0;
		let maxLoud = 0;
		let sumDiff = 0;
		for (let f = 0; f < frames; f++) {
			for (let b = 0; b < 144; b++) {
				const ref = fixture.features[f][b];
				const d = Math.abs(features[f * 144 + b] - ref);
				maxDiff = Math.max(maxDiff, d);
				if (ref > floor) maxLoud = Math.max(maxLoud, d);
				sumDiff += d;
			}
		}
		expect(maxLoud).toBeLessThan(0.02);
		expect(maxDiff).toBeLessThan(0.5);
		expect(sumDiff / (frames * 144)).toBeLessThan(0.002);
	});
	test("the fixture's indices encode to its runs with the model's labels", () => {
		expect(chordminiRunsOf(Int32Array.from(fixture.indices), config.chordVocab)).toEqual(
			fixture.runs,
		);
	});
});

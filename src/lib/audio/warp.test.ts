import { describe, expect, it } from "vite-plus/test";
import {
	renderWarp,
	scaleWarp,
	uniformWarp,
	warpContentAt,
	warpFromPoints,
	warpPointsOver,
	warpRatioAt,
	warpSourceAt,
	warpUniformRatio,
} from "./warp";

const sine = (hz: number, seconds: number, sampleRate: number, amp = 0.5) => {
	const out = new Float32Array(Math.round(seconds * sampleRate));
	for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sampleRate);
	return out;
};
const pitchOf = (x: Float32Array, sampleRate: number) => {
	const a = Math.floor(x.length * 0.25);
	const b = Math.floor(x.length * 0.75);
	let crossings = 0;
	for (let i = a + 1; i < b; i++) if (x[i - 1]! < 0 !== x[i]! < 0) crossings++;
	return (crossings / 2) * (sampleRate / (b - a));
};

describe("warp", () => {
	it("maps content to the file and back along a uniform warp, past both ends", () => {
		// A 170 bpm loop played at 149: each file second runs 1.1409 content seconds.
		const w = uniformWarp(170 / 149, 4);
		expect(w).toEqual([
			{ at: 0, source: 0 },
			{ at: 4.563758, source: 4 },
		]);
		expect(warpSourceAt(w, 4.563758)).toBeCloseTo(4, 5);
		expect(warpSourceAt(w, 9.127517)).toBeCloseTo(8, 4);
		expect(warpContentAt(w, 2)).toBeCloseTo(2.281879, 5);
		expect(warpRatioAt(w, 1)).toBeCloseTo(170 / 149, 5);
		expect(warpUniformRatio(w)).toBeCloseTo(170 / 149, 5);
	});
	it("runs segment by segment, holds a flat segment, and knows it is not uniform", () => {
		const w = [
			{ at: 0, source: 0 },
			{ at: 2, source: 1 }, // half speed
			{ at: 3, source: 3 }, // double speed
			{ at: 4, source: 3 }, // held
			{ at: 5, source: 4 },
		];
		expect(warpSourceAt(w, 1)).toBe(0.5);
		expect(warpSourceAt(w, 2.5)).toBe(2);
		expect(warpSourceAt(w, 3.5)).toBe(3);
		expect(warpSourceAt(w, 6)).toBe(5);
		expect(warpContentAt(w, 0.5)).toBe(1);
		expect(warpContentAt(w, 2)).toBe(2.5);
		expect(warpContentAt(w, 3)).toBe(3);
		expect(warpContentAt(w, 5)).toBe(6);
		expect(warpRatioAt(w, 2.5)).toBe(0.5);
		expect(warpRatioAt(w, 3.5)).toBe(Number.POSITIVE_INFINITY);
		expect(warpUniformRatio(w)).toBeNull();
		expect(scaleWarp(w, 2)[1]).toEqual({ at: 4, source: 1 });
	});
	it("builds a warp from a file's points and says when there is none to keep", () => {
		expect(warpFromPoints([{ at: 0, source: 0 }])).toBeNull();
		expect(
			warpFromPoints([
				{ at: 0, source: 1 },
				{ at: 8, source: 9 },
			]),
		).toBeNull();
		expect(
			warpFromPoints([
				{ at: 8, source: 3 },
				{ at: 0, source: 1 },
				{ at: 8, source: 3.5 },
				{ at: 10, source: 2 },
			]),
		).toEqual([
			{ at: 0, source: 1 },
			{ at: 8, source: 3.5 },
		]);
		expect(
			warpPointsOver(
				[
					{ at: 1, source: 1 },
					{ at: 3, source: 2 },
				],
				6,
			),
		).toEqual([
			{ at: 0, source: 0.5 },
			{ at: 1, source: 1 },
			{ at: 3, source: 2 },
			{ at: 6, source: 3.5 },
		]);
	});
	it("renders the warped content at the same pitch, each segment its own length", () => {
		const sampleRate = 22050;
		const tone = sine(220, 2, sampleRate);
		const w = [
			{ at: 0, source: 0 },
			{ at: 1.5, source: 1 }, // half again as long
			{ at: 2, source: 2 }, // then half as long
		];
		const [out] = renderWarp([tone], sampleRate, w);
		expect(out!.length).toBe(Math.round(2 * sampleRate));
		expect(pitchOf(out!.subarray(0, Math.round(1.5 * sampleRate)), sampleRate)).toBeCloseTo(
			220,
			-1,
		);
		expect(pitchOf(out!.subarray(Math.round(1.5 * sampleRate)), sampleRate)).toBeCloseTo(220, -1);
		// A uniform warp over a longer file: the content runs the file's length times the ratio.
		const [longer] = renderWarp([tone], sampleRate, uniformWarp(1.25));
		expect(longer!.length).toBe(Math.round(2.5 * sampleRate));
	});
});

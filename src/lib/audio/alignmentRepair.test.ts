import { describe, expect, test } from "vite-plus/test";
import { combSlide, jointOnsetComb, repairEnds, trustedSpan } from "./alignmentRepair.js";

const FPS = 100;
const P = 2;
const N = 80;
const T0 = 3;
/** The true bar starts: 80 lattice points from 3 s at 2 s. */
const truth = Array.from({ length: N }, (_, i) => T0 + i * P);

/** A seeded uniform draw in [0, 1). */
function rng(seed = 7) {
	return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/**
 * An onset envelope at 100 fps: a hit at each of `hits` ([seconds, gain]), peaking on its frame
 * and smeared over ±0.15 s as a played note's flux is, over low noise.
 */
function envelope(hits: [number, number][], seconds = T0 + N * P + 2): Float32Array {
	const onset = new Float32Array(Math.round(seconds * FPS));
	const rand = rng();
	for (let f = 0; f < onset.length; f++) onset[f] = 0.05 * rand();
	for (const [t, gain] of hits) {
		const at = Math.round(t * FPS);
		for (let k = -15; k <= 15; k++)
			if (at + k >= 0 && at + k < onset.length) onset[at + k]! += gain * 0.8 ** Math.abs(k);
	}
	return onset;
}

/** Bar lines at full strength, the other three beats of each bar at 0.4. */
const barsAndBeats = envelope(
	truth.flatMap((t) => [
		[t, 1] as [number, number],
		...[1, 2, 3].map((b) => [t + (b * P) / 4, 0.4] as [number, number]),
	]),
);

/** The warping's failure shape: the first 7 starts squeezed into half bars ending at the true bar 8, the last 6 dragged 10 s early, a little wobble between. */
function dtwShape(): number[] {
	const rand = rng(11);
	const ts = truth.map((t) => t + 0.06 * (rand() - 0.5));
	for (let k = 0; k < 7; k++) ts[k] = truth[7]! - (7 - k) * 0.5 * P;
	for (let k = N - 6; k < N; k++) ts[k] = truth[k]! - 10;
	return ts;
}

describe("jointOnsetComb", () => {
	test("finds the bar within 0.05 % from a declared bar 3 % off", () => {
		const comb = jointOnsetComb(barsAndBeats, FPS, P * 1.03);
		expect(Math.abs(comb.period - P) / P).toBeLessThan(0.0005);
		const slow = jointOnsetComb(barsAndBeats, FPS, P * 0.97);
		expect(Math.abs(slow.period - P) / P).toBeLessThan(0.0005);
	});
});

describe("repairEnds", () => {
	test("puts every start within 0.05 s of the truth and marks the rebuilt ends extrapolated", () => {
		const { period } = jointOnsetComb(barsAndBeats, FPS, P * 1.03);
		const repaired = repairEnds(dtwShape(), barsAndBeats, FPS, period)!;
		expect(repaired).not.toBeNull();
		expect(repaired.barStarts).toHaveLength(N);
		for (const [i, t] of repaired.barStarts.entries())
			expect(Math.abs(t - truth[i]!)).toBeLessThanOrEqual(0.05);
		expect(repaired.iFirst).toBe(7);
		expect(repaired.iLast).toBe(N - 7);
		expect(repaired.confidence.slice(0, 7).every((c) => c === "extrapolated")).toBe(true);
		expect(repaired.confidence.slice(-6).every((c) => c === "extrapolated")).toBe(true);
		expect(repaired.confidence.slice(7, -6).every((c) => c === "aligned")).toBe(true);
	});

	test("refuses a middle that sits 0.4 bar off the lattice everywhere", () => {
		const ts = truth.map((t, i) => t + (i % 2 ? 0.4 : -0.4) * P);
		expect(repairEnds(ts, barsAndBeats, FPS, P)).toBeNull();
	});

	test("fences an end's slide at a quarter bar even when the onsets sit 0.4 bar later", () => {
		const hits = truth.map((t, i) => [i < 7 ? t + 0.4 * P : t, 1] as [number, number]);
		const onset = envelope(hits);
		const ts = dtwShape();
		const repaired = repairEnds(ts, onset, FPS, P)!;
		expect(Math.abs(repaired.slides.intro)).toBeLessThanOrEqual(0.25 * P + 1e-9);
		for (let k = 0; k < 7; k++) {
			const extrapolated = ts[7]! - (7 - k) * P;
			expect(Math.abs(repaired.barStarts[k]! - extrapolated)).toBeLessThanOrEqual(0.25 * P + 1e-9);
		}
	});
});

describe("trustedSpan and combSlide", () => {
	test("the span opens and closes on runs of four; none is null", () => {
		const ts = truth.slice(0, 10).map((t, i) => (i === 0 || i === 9 ? t + 1 : t));
		expect(trustedSpan(ts, P, (i) => T0 + i * P)).toEqual({ iFirst: 1, iLast: 8 });
		const scattered = truth.slice(0, 10).map((t, i) => (i % 3 === 0 ? t + 1 : t));
		expect(trustedSpan(scattered, P, (i) => T0 + i * P)).toBeNull();
	});

	test("slides a set of times onto the onsets", () => {
		const shifted = truth.slice(0, 5).map((t) => t - 0.2);
		expect(combSlide(barsAndBeats, FPS, shifted, 0.3)).toBeCloseTo(0.2, 5);
	});
});

import { describe, expect, it } from "vite-plus/test";
import { alignmentFit } from "./alignmentFit";

/** Bar starts from `first`, each bar `spans[i]` long (the last span repeats). */
function starts(first: number, spans: number[], n: number): number[] {
	const out = [first];
	for (let i = 1; i < n; i++) out.push(out[i - 1]! + spans[Math.min(i - 1, spans.length - 1)]!);
	return out;
}

/** 132 bpm in 4/4: a declared bar of 1.82 s. */
const DECLARED = { startAt: 0, barSeconds: (60 / 132) * 4 };

describe("alignmentFit", () => {
	it("fails Letter Lands' alignment on bar 1 and the bar length", () => {
		// Bar 1 at 8.06 s, the first seven bars 0.9 s, then 1.5 s bars.
		const barStarts = starts(8.06, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.5], 70);
		const fit = alignmentFit({ barStarts, cost: 0.1, controlCost: 0.5, firstSound: 0 }, DECLARED);
		expect(fit.ok).toBe(false);
		expect(fit.bar1).toBe(8.06);
		expect(fit.medianBar).toBeCloseTo(1.5);
		expect(fit.reasons).toEqual([
			"bar 1 at 0:08 where the sound starts at 0:00",
			"bars 1.5 s where the tempo says 1.82 s",
		]);
	});

	it("passes a clean alignment", () => {
		const barStarts = starts(0.1, [1.8, 1.84, 1.82, 1.83, 1.81], 40);
		const fit = alignmentFit({ barStarts, cost: 0.05, controlCost: 0.45, firstSound: 0 }, DECLARED);
		expect(fit).toMatchObject({ ok: true, reasons: [] });
		expect(fit.ratio).toBeCloseTo(9);
	});

	it("fails a chart that barely beats a wrong one", () => {
		const barStarts = starts(0.1, [1.82], 40);
		const fit = alignmentFit({ barStarts, cost: 0.1, controlCost: 0.12, firstSound: 0 }, DECLARED);
		expect(fit.ok).toBe(false);
		expect(fit.reasons).toEqual([
			"the chart fits the recording little better than a wrong one would",
		]);
	});

	it("measures bar 1 from the first sound when it comes after the start", () => {
		const barStarts = starts(6, [1.82], 40);
		const cost = { cost: 0.05, controlCost: 0.45 };
		expect(alignmentFit({ barStarts, ...cost, firstSound: 5.5 }, DECLARED).ok).toBe(true);
		expect(alignmentFit({ barStarts, ...cost, firstSound: 0 }, DECLARED).reasons).toEqual([
			"bar 1 at 0:06 where the sound starts at 0:00",
		]);
		expect(
			alignmentFit({ barStarts, ...cost, firstSound: 0 }, { ...DECLARED, startAt: 5 }).ok,
		).toBe(true);
	});

	it("needs two bar starts, and keeps the ratio's edges", () => {
		expect(
			alignmentFit({ barStarts: [0], cost: 0.1, controlCost: 0.5, firstSound: 0 }, DECLARED),
		).toMatchObject({ ok: false, reasons: ["too few bars"] });
		expect(
			alignmentFit({ barStarts: [0, 1.82], cost: 0, controlCost: 0.5, firstSound: 0 }, DECLARED)
				.ratio,
		).toBe(Infinity);
		expect(
			alignmentFit({ barStarts: [0, 1.82], cost: 0.1, controlCost: 0, firstSound: 0 }, DECLARED)
				.ratio,
		).toBe(0);
	});
});

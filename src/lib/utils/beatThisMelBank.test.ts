import { describe, expect, test } from "vite-plus/test";
import { beatThisMelBank } from "./beatThisMelBank";

/** Band `m`'s weight on bin `k` from a dense bank. */
function weightAt(m: number, k: number): number {
	const { start, weights } = beatThisMelBank()[m];
	return k >= start && k < start + weights.length ? weights[k - start] : 0;
}

describe("beatThisMelBank", () => {
	test("128 bands over 513 bins, none empty, peaks at most 1", () => {
		const bank = beatThisMelBank();
		expect(bank).toHaveLength(128);
		for (const band of bank) {
			expect(band.weights.length).toBeGreaterThan(0);
			expect(Math.max(...band.weights)).toBeLessThanOrEqual(1);
			expect(band.start + band.weights.length).toBeLessThanOrEqual(513);
		}
	});
	test("band 0 by hand, in slaney's linear region", () => {
		// Mels are Hz / (200/3) below 1 kHz. m_min = 30 · 3/200 = 0.45;
		// m_max = 15 + ln(11000/1000) / (ln 6.4 / 27). Corners every
		// (m_max − m_min)/129 mels, so f0 = 30, f1 = 30 + step·200/3, f2 = 30 + 2·step·200/3.
		const mMax = 15 + Math.log(11) / (Math.log(6.4) / 27);
		const stepHz = ((mMax - 0.45) / 129) * (200 / 3);
		const f0 = 30;
		const f1 = f0 + stepHz; // ≈ 55.54 Hz
		const f2 = f0 + 2 * stepHz; // ≈ 81.09 Hz
		const binHz = 11025 / 512; // ≈ 21.53 Hz
		// Bin 1 (21.5 Hz) is below f0; bin 2 (43.1 Hz) on the rising edge;
		// bin 3 (64.6 Hz) on the falling edge; bin 4 (86.1 Hz) past f2.
		expect(weightAt(0, 1)).toBe(0);
		expect(weightAt(0, 2)).toBeCloseTo((2 * binHz - f0) / (f1 - f0), 12);
		expect(weightAt(0, 3)).toBeCloseTo((f2 - 3 * binHz) / (f2 - f1), 12);
		expect(weightAt(0, 4)).toBe(0);
		expect(weightAt(0, 2)).toBeCloseTo(0.5115, 3);
		expect(weightAt(0, 3)).toBeCloseTo(0.6455, 3);
	});
	test("the top band stops before 11 kHz's bin", () => {
		const top = beatThisMelBank()[127];
		// 11000 Hz is bin 510.84, so bin 511 is past the last corner.
		expect(top.start + top.weights.length - 1).toBe(510);
	});
});

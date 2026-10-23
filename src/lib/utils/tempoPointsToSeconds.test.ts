import { describe, expect, it } from "vite-plus/test";
import { tempoPointsToSeconds } from "./tempoPointsToSeconds";

describe("tempoPointsToSeconds", () => {
	it("steps: each point's second through the tempos held before it", () => {
		expect(
			tempoPointsToSeconds([
				{ beat: 0, bpm: 120 },
				{ beat: 16, bpm: 60 },
				{ beat: 20, bpm: 90 },
			]),
		).toEqual([
			{ start: 0, bpm: 120 },
			{ start: 8, bpm: 60 },
			{ start: 12, bpm: 90 },
		]);
	});
	it("a ramp: its beats over the log mean of its tempos, kept as a beats curve", () => {
		// 16 beats from 120 down to 60: 16 × 60 × ln 2 / 60 = 11.09 s.
		expect(
			tempoPointsToSeconds([
				{ beat: 0, bpm: 120, ramp: true },
				{ beat: 16, bpm: 60 },
			]),
		).toEqual([
			{ start: 0, bpm: 120 },
			{ start: Math.round(16 * Math.log(2) * 1e6) / 1e6, bpm: 60, ramp: "beats" },
		]);
	});
	it("a repeated tempo is dropped unless a ramp leaves from it", () => {
		expect(
			tempoPointsToSeconds([
				{ beat: 0, bpm: 120 },
				{ beat: 8, bpm: 120 },
				{ beat: 16, bpm: 120, ramp: true },
				{ beat: 24, bpm: 100 },
			]),
		).toEqual([
			{ start: 0, bpm: 120 },
			{ start: 8, bpm: 120 },
			// Eight beats from 120 down to 100: 60 × 8 × ln(100/120) / (100 − 120) = 4.3757 s after 8 s.
			{
				start: Math.round((8 + (480 * Math.log(100 / 120)) / -20) * 1e6) / 1e6,
				bpm: 100,
				ramp: "beats",
			},
		]);
	});
	it("two points on one beat are a jump, the stretch before them held", () => {
		expect(
			tempoPointsToSeconds([
				{ beat: 0, bpm: 120, ramp: true },
				{ beat: 16, bpm: 120 },
				{ beat: 16, bpm: 90, ramp: true },
				{ beat: 24, bpm: 90 },
			]),
		).toEqual([
			{ start: 0, bpm: 120 },
			{ start: 8, bpm: 90 },
		]);
	});
	it("nothing: 120", () => {
		expect(tempoPointsToSeconds([])).toEqual([{ start: 0, bpm: 120 }]);
	});
});

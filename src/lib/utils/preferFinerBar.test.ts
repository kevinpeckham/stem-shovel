import { describe, expect, test } from "vite-plus/test";
import type { Detection } from "#lib/audio/analysis.js";
import {
	AUTOMATIC_FINER_BAR_MAX_BPM,
	AUTOMATIC_FINER_BAR_SHARE,
} from "#lib/constants/chartVerdict.js";
import { preferFinerBar } from "./preferFinerBar.js";

const detection = (over: Partial<Detection["tempo"]> = {}): Detection => ({
	tempo: {
		bpm: 72,
		confidence: 0.7,
		subdivision: 2,
		alternates: [
			{ factor: 2, bpm: 144, strength: 0.95 },
			{ factor: 0.5, bpm: 36, strength: 0.6 },
			{ factor: 3, bpm: 216, strength: 0.3 },
		],
		...over,
	},
	meter: { value: "4/4", confidence: 0.4 },
	key: { value: "D major", confidence: 0.8 },
});

describe("preferFinerBar", () => {
	test("a ×2 rung that nearly ties the beat becomes the beat, the ladder re-based on it", () => {
		const d = preferFinerBar(detection());
		expect(d.tempo.bpm).toBe(144);
		expect(d.tempo.alternates).toEqual([
			{ factor: 0.5, bpm: 72, strength: 1.05 },
			{ factor: 0.25, bpm: 36, strength: 0.63 },
			{ factor: 1.5, bpm: 216, strength: 0.32 },
		]);
		expect(d.meter).toEqual(detection().meter);
	});

	test("a weaker ×2 rung, a compound beat or a result past the ceiling leaves the detection as it is", () => {
		expect(AUTOMATIC_FINER_BAR_SHARE).toBe(0.9);
		expect(AUTOMATIC_FINER_BAR_MAX_BPM).toBe(240);
		const weak = detection({ alternates: [{ factor: 2, bpm: 144, strength: 0.85 }] });
		expect(preferFinerBar(weak)).toBe(weak);
		const compound = detection({ subdivision: 3 });
		expect(preferFinerBar(compound)).toBe(compound);
		const fast = detection({ bpm: 130, alternates: [{ factor: 2, bpm: 260, strength: 1 }] });
		expect(preferFinerBar(fast)).toBe(fast);
		const none = detection({ alternates: [] });
		expect(preferFinerBar(none)).toBe(none);
	});
});

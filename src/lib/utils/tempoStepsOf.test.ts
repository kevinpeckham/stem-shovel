import { describe, expect, it } from "vite-plus/test";
import { studioGrid } from "./studioGrid";
import { tempoStepsOf } from "./tempoStepsOf";

describe("tempoStepsOf", () => {
	it("keeps steps as they are and lays a ramp down at every beat line inside it", () => {
		const changes = [
			{ start: 8, bpm: 90, ramp: "time" as const },
			{ start: 12, bpm: 100 },
		];
		const steps = tempoStepsOf(
			studioGrid({ bpm: 120, beatsPerBar: 4, tempoChanges: changes }),
			changes,
		);
		// Eight seconds from 120 down to 90, linear in seconds: fourteen beats, a step on each after the first, then the ramp's own point.
		expect(steps.length).toBe(15);
		// The first beat line falls a hair after half a second: the tempo is already easing as the beat plays out.
		expect(steps[0]!.start).toBeCloseTo(0.504, 3);
		expect(steps[0]!.bpm).toBeCloseTo(118.1, 1);
		expect(steps[13]).toEqual({ start: 8, bpm: 90 });
		expect(steps[14]).toEqual({ start: 12, bpm: 100 });
		expect(steps.every((s, i) => i === 0 || s.start > steps[i - 1]!.start)).toBe(true);
	});
	it("nothing to a map without changes", () => {
		expect(tempoStepsOf(studioGrid({ bpm: 120, beatsPerBar: 4 }), [])).toEqual([]);
	});
});

import { describe, expect, it } from "vite-plus/test";
import { arpStepIndex } from "./arpStep";

describe("arpStepIndex", () => {
	it("cycles the sequence when not aligned", () => {
		expect([0, 1, 2, 3, 4, 5].map((s) => arpStepIndex(s, 4, null))).toEqual([0, 1, 2, 3, 0, 1]);
	});
	it("restarts the pattern at every bar, dropping what was left", () => {
		// Eighth notes in 4/4: eight steps a bar; a five-note pattern starts again at step 8.
		expect([0, 5, 7, 8, 9, 15, 16].map((s) => arpStepIndex(s, 5, 8))).toEqual([
			0, 0, 2, 0, 1, 2, 0,
		]);
		// Two bars: sixteen steps before the restart.
		expect([15, 16].map((s) => arpStepIndex(s, 5, 16))).toEqual([0, 0]);
	});
});

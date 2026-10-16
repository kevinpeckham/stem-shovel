import { describe, expect, it } from "vite-plus/test";
import {
	STAGE_FLOOR_DB,
	STAGE_TOP_DB,
	gainAtY,
	heardDb,
	nudgeGain,
	nudgePan,
	panAtX,
	xOfPan,
	yOfGain,
} from "./stagePosition";

describe("stagePosition", () => {
	it("maps pan across the width and back", () => {
		expect(xOfPan(-1)).toBe(0);
		expect(xOfPan(0)).toBe(0.5);
		expect(xOfPan(1)).toBe(1);
		expect(panAtX(0.25)).toBe(-0.5);
		expect(panAtX(1.4)).toBe(1);
		expect(panAtX(-0.2)).toBe(-1);
	});

	it("puts the loudest track at unity on the unity line and the floor at the bottom", () => {
		const unityY = (0 - STAGE_FLOOR_DB) / (STAGE_TOP_DB - STAGE_FLOOR_DB);
		expect(yOfGain(1, 0)).toBeCloseTo(unityY, 6);
		expect(yOfGain(1.25, 0)).toBeCloseTo(1, 6);
		expect(yOfGain(0, 0)).toBe(0);
		expect(yOfGain(10 ** (STAGE_FLOOR_DB / 20), 0)).toBeCloseTo(0, 6);
	});

	it("sits a quieter track lower at the same fader", () => {
		expect(heardDb(1, -12)).toBe(-12);
		expect(yOfGain(1, -12)).toBeLessThan(yOfGain(1, 0));
		expect(yOfGain(10 ** (12 / 20), -12)).toBeCloseTo(yOfGain(1, 0), 6);
	});

	it("inverts: the gain at a puck's y is the gain that put it there", () => {
		for (const loud of [0, -6, -20])
			for (const gain of [0.05, 0.5, 1, 1.2]) {
				const y = yOfGain(gain, loud);
				if (y < 1) expect(gainAtY(y, loud)).toBeCloseTo(gain, 5);
			}
		expect(gainAtY(0, 0)).toBe(0);
		expect(gainAtY(1, 0)).toBeCloseTo(1.25, 6);
		// A quiet track cannot be pushed past the fader's top.
		expect(gainAtY(1, -30)).toBe(1.25);
	});

	it("nudges by dB, from silence to the floor, and clamps", () => {
		expect(nudgeGain(1, 1)).toBeCloseTo(10 ** (1 / 20), 6);
		expect(nudgeGain(1, 6)).toBe(1.25);
		expect(nudgeGain(0, 1)).toBeCloseTo(10 ** (STAGE_FLOOR_DB / 20), 9);
		expect(nudgeGain(0, -1)).toBe(0);
		expect(nudgeGain(0.0045, -3)).toBe(0);
		expect(nudgePan(0, 0.05)).toBe(0.05);
		expect(nudgePan(0.98, 0.05)).toBe(1);
		expect(nudgePan(-0.97, -0.2)).toBe(-1);
	});
});

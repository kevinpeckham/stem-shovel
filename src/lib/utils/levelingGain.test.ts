import { describe, expect, it } from "vite-plus/test";
import { levelingGainDb } from "./levelingGain";

describe("levelingGainDb", () => {
	it("a quiet set with headroom gets the full gain to -14 LUFS", () => {
		expect(levelingGainDb({ integrated: -22.3, truePeak: -12 })).toBe(8.3);
	});
	it("a peaky set is held back: at most 3 dB of its true peak goes over -1 dBTP", () => {
		const m = { integrated: -24, truePeak: -2 };
		const gain = levelingGainDb(m);
		expect(gain).toBe(4);
		expect(m.truePeak + gain).toBe(-1 + 3);
	});
	it("a set already at the target gets about nothing", () => {
		expect(levelingGainDb({ integrated: -14.04, truePeak: -1.5 })).toBe(0);
	});
	it("a hot set comes down", () => {
		expect(levelingGainDb({ integrated: -9.7, truePeak: 0.4 })).toBe(-4.3);
	});
	it("takes another target and limit", () => {
		expect(
			levelingGainDb({ integrated: -30, truePeak: -10 }, { integrated: -16, truePeak: -2 }, 0),
		).toBe(8);
	});
});

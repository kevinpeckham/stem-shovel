import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";
import { isFlatEq, normalizePlaybackEq } from "./normalizePlaybackEq";

describe("normalizePlaybackEq", () => {
	it("is the defaults for nothing, junk or an empty object", () => {
		expect(normalizePlaybackEq(null)).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(normalizePlaybackEq("x")).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(normalizePlaybackEq({})).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(normalizePlaybackEq(null)).not.toBe(DEFAULT_PLAYBACK_EQ);
	});
	it("clamps gains to the half-dB grid and centers to the band's range, in whole Hz", () => {
		const s = normalizePlaybackEq({
			highPass: true,
			low: { gain: 40, freq: 10 },
			mid: { gain: 1.3, freq: 1234.6 },
			high: { gain: -2, freq: 99999 },
		});
		expect(s.highPass).toBe(true);
		expect(s.low).toEqual({ gain: 12, freq: 60 });
		expect(s.mid).toEqual({ gain: 1.5, freq: 1235 });
		expect(s.high).toEqual({ gain: -2, freq: 12000 });
		expect(s.lowMid).toEqual({ gain: 0, freq: 400 });
		expect(s.highMid).toEqual({ gain: 0, freq: 2500 });
	});
	it("reads the first EQ's bare gains as gains at the default centers", () => {
		const s = normalizePlaybackEq({ highPass: false, low: 4, mid: -3, high: 0 });
		expect(s.low).toEqual({ gain: 4, freq: 200 });
		expect(s.mid).toEqual({ gain: -3, freq: 1000 });
		expect(s.high).toEqual({ gain: 0, freq: 4000 });
	});
});

describe("isFlatEq", () => {
	it("is true with the high-pass off and every gain 0, whatever the centers", () => {
		expect(isFlatEq(DEFAULT_PLAYBACK_EQ)).toBe(true);
		expect(isFlatEq({ ...DEFAULT_PLAYBACK_EQ, mid: { gain: 0, freq: 2000 } })).toBe(true);
		expect(isFlatEq({ ...DEFAULT_PLAYBACK_EQ, highPass: true })).toBe(false);
		expect(isFlatEq({ ...DEFAULT_PLAYBACK_EQ, lowMid: { gain: -1, freq: 400 } })).toBe(false);
	});
});

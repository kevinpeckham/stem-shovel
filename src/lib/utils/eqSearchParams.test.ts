import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";
import { eqSearchParams, parseEqSearchParams } from "./eqSearchParams";

describe("eqSearchParams", () => {
	it("writes only what is not the default, and reads it back", () => {
		const settings = {
			...DEFAULT_PLAYBACK_EQ,
			highPass: true,
			low: { gain: 4, freq: 200 },
			highMid: { gain: -2.5, freq: 3000 },
			high: { gain: 0, freq: 6000 },
		};
		const q = eqSearchParams(settings);
		expect(q.toString()).toBe("hp=1&low=4&highMid=-2.5&highMidf=3000&highf=6000");
		expect(parseEqSearchParams(q)).toEqual(settings);
	});
	it("flat settings are an empty query, and an empty query is the defaults", () => {
		expect(eqSearchParams(DEFAULT_PLAYBACK_EQ).toString()).toBe("");
		expect(parseEqSearchParams(new URLSearchParams())).toEqual(DEFAULT_PLAYBACK_EQ);
	});
	it("clamps, snaps to the half-dB grid, keeps centers in range and ignores junk", () => {
		expect(
			parseEqSearchParams(new URLSearchParams("hp=yes&low=40&mid=1.3&midf=99999&high=abc&highf=x")),
		).toEqual({
			...DEFAULT_PLAYBACK_EQ,
			low: { gain: 12, freq: 200 },
			mid: { gain: 1.5, freq: 3000 },
		});
	});
});

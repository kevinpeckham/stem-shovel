import { expect, it } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";
import { eqFilterGraph } from "./eqFilterGraph";

it("builds the stages in order at their centers, skipping bands with no gain", () => {
	expect(
		eqFilterGraph({
			...DEFAULT_PLAYBACK_EQ,
			highPass: true,
			low: { gain: 4, freq: 150 },
			mid: { gain: -1.5, freq: 1000 },
			highMid: { gain: 0, freq: 3000 },
			high: { gain: 2, freq: 6000 },
		}),
	).toBe(
		"highpass=f=80:poles=2,lowshelf=f=150:g=4,equalizer=f=1000:width_type=q:w=1:g=-1.5,highshelf=f=6000:g=2",
	);
	expect(eqFilterGraph({ ...DEFAULT_PLAYBACK_EQ, lowMid: { gain: 3, freq: 500 } })).toBe(
		"equalizer=f=500:width_type=q:w=1:g=3",
	);
});

it("flat throughout is no filter", () => {
	expect(eqFilterGraph(DEFAULT_PLAYBACK_EQ)).toBeNull();
});

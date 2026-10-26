import { expect, it } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";
import { eqHeadroomDb } from "./eqHeadroomDb";

it("is the largest boost, and 0 for cuts alone or flat", () => {
	expect(eqHeadroomDb(DEFAULT_PLAYBACK_EQ)).toBe(0);
	expect(eqHeadroomDb({ ...DEFAULT_PLAYBACK_EQ, mid: { gain: -6, freq: 1000 } })).toBe(0);
	expect(
		eqHeadroomDb({
			...DEFAULT_PLAYBACK_EQ,
			low: { gain: 4, freq: 200 },
			high: { gain: 2.5, freq: 4000 },
			mid: { gain: -3, freq: 1000 },
		}),
	).toBe(4);
});

import { describe, expect, it } from "vite-plus/test";
import { DRUM_LAYER_DEFAULT_STEP_DB } from "#lib/constants/drumKits.js";
import { LayeredSynthKit } from "./layeredSynthKit";
import type { DrumKit } from "./types";

/** A synth that records the gain of each hit. */
function recording() {
	const gains: number[] = [];
	const synth: DrumKit = {
		id: "synth",
		warm() {},
		load: () => Promise.resolve(),
		play(_voice, _ctx, _at, gain) {
			gains.push(gain);
			return null;
		},
	};
	return { synth, gains };
}
const ctx = {} as BaseAudioContext;
const out = {} as AudioNode;
const db = (ratio: number) => Math.round(20 * Math.log10(ratio) * 1000) / 1000;

describe("LayeredSynthKit", () => {
	it("V5 plays the synth at the given gain; each layer below a default step quieter", () => {
		const { synth, gains } = recording();
		const kit = new LayeredSynthKit("synth", synth);
		for (const layer of [5, 4, 3, 2, 1]) kit.play("kick", ctx, 0, 0.5, out, layer);
		expect(gains[0]).toBe(0.5);
		expect(gains.map((g) => db(g / 0.5))).toEqual(
			[0, 1, 2, 3, 4].map((n) => (n === 0 ? 0 : -n * DRUM_LAYER_DEFAULT_STEP_DB)),
		);
	});
	it("a layer out of range is clamped to 1–5", () => {
		const { synth, gains } = recording();
		const kit = new LayeredSynthKit("synth", synth);
		kit.play("kick", ctx, 0, 1, out, 9);
		kit.play("kick", ctx, 0, 1, out, 0);
		expect(gains[0]).toBe(1);
		expect(db(gains[1]!)).toBe(-4 * DRUM_LAYER_DEFAULT_STEP_DB);
	});
});

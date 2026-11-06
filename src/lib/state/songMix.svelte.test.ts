import { describe, expect, test } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { SongMix } from "./songMix.svelte.js";

/** The listener's mix against the song's default: dirty for any move, faders-dirty for a fader or pan alone. */
const manifest = {
	stems: [
		{ id: "a", gain: 0.5, pan: -0.25 },
		{ id: "b", gain: null, pan: null },
	],
};

function engine(over: Partial<{ master: number; stems: object[] }> = {}) {
	return {
		master: 1,
		stems: [
			{ id: "a", gain: 0.5, pan: -0.25, muted: false, soloed: false },
			{ id: "b", gain: 1, pan: 0, muted: false, soloed: false },
		],
		...over,
	} as unknown as StemEngine;
}

const mixOf = (e: StemEngine | null) => new SongMix({ manifest: () => manifest, engine: () => e });

describe("SongMix", () => {
	test("the defaults per stem: the saved gain and pan, else unity and center", () => {
		const mix = mixOf(null);
		expect(mix.defaultGains).toEqual(
			new Map([
				["a", 0.5],
				["b", 1],
			]),
		);
		expect(mix.defaultPans).toEqual(
			new Map([
				["a", -0.25],
				["b", 0],
			]),
		);
	});

	test("no engine: nothing is dirty", () => {
		const mix = mixOf(null);
		expect(mix.dirty).toBe(false);
		expect(mix.fadersDirty).toBe(false);
	});

	test("at the default mix: nothing is dirty", () => {
		const mix = mixOf(engine());
		expect(mix.dirty).toBe(false);
		expect(mix.fadersDirty).toBe(false);
	});

	test("a fader or a pan moved: dirty and faders-dirty", () => {
		const moved = engine({
			stems: [
				{ id: "a", gain: 0.5, pan: 0, muted: false, soloed: false },
				{ id: "b", gain: 1, pan: 0, muted: false, soloed: false },
			],
		});
		const mix = mixOf(moved);
		expect(mix.stemDirty({ id: "a", gain: 0.5, pan: 0 })).toBe(true);
		expect(mix.stemDirty({ id: "b", gain: 1, pan: 0 })).toBe(false);
		expect(mix.dirty).toBe(true);
		expect(mix.fadersDirty).toBe(true);
	});

	test("the master, a mute or a solo: dirty, but no new default to save", () => {
		expect(mixOf(engine({ master: 0.8 })).dirty).toBe(true);
		const muted = engine({
			stems: [
				{ id: "a", gain: 0.5, pan: -0.25, muted: true, soloed: false },
				{ id: "b", gain: 1, pan: 0, muted: false, soloed: true },
			],
		});
		const mix = mixOf(muted);
		expect(mix.dirty).toBe(true);
		expect(mix.fadersDirty).toBe(false);
	});
});

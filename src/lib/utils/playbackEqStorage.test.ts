import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";
import {
	clearPlaybackEq,
	loadPlaybackEq,
	playbackEqKey,
	savePlaybackEq,
} from "./playbackEqStorage";

function memory() {
	const m = new Map<string, string>();
	return {
		getItem: (k: string) => m.get(k) ?? null,
		setItem: (k: string, v: string) => void m.set(k, v),
		removeItem: (k: string) => void m.delete(k),
		m,
	};
}
const throwing = {
	getItem: () => {
		throw new Error("blocked");
	},
	setItem: () => {
		throw new Error("blocked");
	},
	removeItem: () => {
		throw new Error("blocked");
	},
};

describe("playbackEqStorage", () => {
	it("is null with nothing stored, no storage, or storage that throws", () => {
		expect(loadPlaybackEq("s1", memory())).toBeNull();
		expect(loadPlaybackEq("s1", null)).toBeNull();
		expect(loadPlaybackEq("s1", throwing)).toBeNull();
		expect(() => savePlaybackEq("s1", DEFAULT_PLAYBACK_EQ, throwing)).not.toThrow();
		expect(() => clearPlaybackEq("s1", throwing)).not.toThrow();
	});
	it("keeps one entry per session, round-trips it and clears it", () => {
		const store = memory();
		const eq = { ...DEFAULT_PLAYBACK_EQ, highPass: true, mid: { gain: -3, freq: 1200 } };
		savePlaybackEq("s1", eq, store);
		expect(store.m.has(playbackEqKey("s1"))).toBe(true);
		expect(loadPlaybackEq("s1", store)).toEqual(eq);
		expect(loadPlaybackEq("s2", store)).toBeNull();
		clearPlaybackEq("s1", store);
		expect(loadPlaybackEq("s1", store)).toBeNull();
	});
	it("normalizes what it reads: clamps, snaps, and reads the first EQ's bare gains", () => {
		const store = memory();
		store.setItem(
			playbackEqKey("s1"),
			JSON.stringify({ highPass: "yes", low: 40, mid: { gain: 1.3, freq: 5 } }),
		);
		expect(loadPlaybackEq("s1", store)).toEqual({
			...DEFAULT_PLAYBACK_EQ,
			low: { gain: 12, freq: 200 },
			mid: { gain: 1.5, freq: 400 },
		});
		store.setItem(playbackEqKey("s1"), "not json");
		expect(loadPlaybackEq("s1", store)).toBeNull();
	});
});

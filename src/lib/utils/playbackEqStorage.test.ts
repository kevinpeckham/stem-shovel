import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_PLAYBACK_EQ } from "#lib/audio/playbackEq.js";
import { loadPlaybackEq, PLAYBACK_EQ_KEY, savePlaybackEq } from "./playbackEqStorage";

function fakeStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
	};
}
const throwing = {
	getItem: () => {
		throw new Error("blocked");
	},
	setItem: () => {
		throw new Error("quota");
	},
};

describe("playbackEqStorage", () => {
	it("is flat with nothing stored, no storage, or storage that throws", () => {
		expect(loadPlaybackEq(fakeStorage())).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(loadPlaybackEq(null)).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(loadPlaybackEq(throwing)).toEqual(DEFAULT_PLAYBACK_EQ);
		expect(() => savePlaybackEq(DEFAULT_PLAYBACK_EQ, throwing)).not.toThrow();
	});

	it("round-trips saved settings under its key", () => {
		const s = fakeStorage();
		const eq = { highPass: true, low: 3.5, mid: -6, high: 0 };
		savePlaybackEq(eq, s);
		expect(JSON.parse(s.data.get(PLAYBACK_EQ_KEY)!)).toEqual(eq);
		expect(loadPlaybackEq(s)).toEqual(eq);
	});

	it("validates the stored shape: clamps, snaps to 0.5 dB, and drops what is not a number or true", () => {
		const s = fakeStorage({
			[PLAYBACK_EQ_KEY]: JSON.stringify({ highPass: "yes", low: 40, mid: -99, high: 1.3 }),
		});
		expect(loadPlaybackEq(s)).toEqual({ highPass: false, low: 12, mid: -12, high: 1.5 });
		s.data.set(PLAYBACK_EQ_KEY, JSON.stringify({ low: "3", mid: null }));
		expect(loadPlaybackEq(s)).toEqual(DEFAULT_PLAYBACK_EQ);
		s.data.set(PLAYBACK_EQ_KEY, "not json");
		expect(loadPlaybackEq(s)).toEqual(DEFAULT_PLAYBACK_EQ);
		s.data.set(PLAYBACK_EQ_KEY, "null");
		expect(loadPlaybackEq(s)).toEqual(DEFAULT_PLAYBACK_EQ);
	});
});

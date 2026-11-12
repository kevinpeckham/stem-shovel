import { describe, expect, test } from "vite-plus/test";
import { effectiveSongSettings } from "./effectiveSongSettings";

const song = {
	changes: [{ kind: "tempo" as const, start: 0, value: "120" }],
	startAt: 1.5,
	endAt: 180,
};
const own = {
	changes: [{ kind: "tempo" as const, start: 0, value: "96" }],
	startAt: 4,
	endAt: null,
};

describe("effectiveSongSettings", () => {
	test("Main is the song's settings", () => {
		expect(effectiveSongSettings(song, null)).toEqual({ ...song, own: false });
	});
	test("an alternate without changes of its own inherits all three, its stale start and end ignored", () => {
		expect(effectiveSongSettings(song, { changes: null, startAt: 9, endAt: 99 })).toEqual({
			...song,
			own: false,
		});
	});
	test("an alternate with its own changes stands on its own three, a null start or end included", () => {
		expect(effectiveSongSettings(song, own)).toEqual({ ...own, own: true });
	});
	test("an empty list of its own is still its own: no tempo, not the song's", () => {
		expect(effectiveSongSettings(song, { changes: [], startAt: null, endAt: null })).toEqual({
			changes: [],
			startAt: null,
			endAt: null,
			own: true,
		});
	});
});

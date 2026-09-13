import type { SongChange } from "$lib/val/SongChangeSchema";
import { describe, expect, test } from "vite-plus/test";
import { formatSongChange } from "./formatSongChange";
import { songChangeValueError } from "./songChangeValueError";
import { timelineKinds } from "./timelineKinds";

describe("songChangeValueError", () => {
	test("tempo is a number between 20 and 400", () => {
		expect(songChangeValueError("tempo", "120")).toBeNull();
		expect(songChangeValueError("tempo", "87.5")).toBeNull();
		expect(songChangeValueError("tempo", "900")).toMatch(/20 and 400/);
		expect(songChangeValueError("tempo", "fast")).toMatch(/20 and 400/);
	});
	test("key is short free text", () => {
		expect(songChangeValueError("key", "F#m")).toBeNull();
		expect(songChangeValueError("key", "")).toMatch(/Enter a value/);
		expect(songChangeValueError("key", "x".repeat(21))).toMatch(/20 characters/);
	});
	test("meter is beats over a note value", () => {
		expect(songChangeValueError("meter", "4/4")).toBeNull();
		expect(songChangeValueError("meter", "7/8")).toBeNull();
		expect(songChangeValueError("meter", "5/3")).toMatch(/4\/4 or 6\/8/);
	});
});

describe("formatSongChange", () => {
	test("tempo gets its unit; others read as typed", () => {
		expect(formatSongChange({ kind: "tempo", start: 0, value: "120" })).toBe("120 bpm");
		expect(formatSongChange({ kind: "key", start: 0, value: "D" })).toBe("D");
		expect(formatSongChange({ kind: "meter", start: 0, value: "6/8" })).toBe("6/8");
	});
});

describe("timelineKinds", () => {
	const at0 = (kind: SongChange["kind"], value: string): SongChange => ({ kind, start: 0, value });
	test("a single change at 0:00 is the song's fixed value, not a lane", () => {
		expect(timelineKinds([at0("tempo", "120"), at0("key", "D"), at0("meter", "4/4")])).toEqual([]);
	});
	test("a kind that changes, or starts later, gets a lane", () => {
		expect(
			timelineKinds([at0("tempo", "120"), { kind: "tempo", start: 90, value: "140" }]),
		).toEqual(["tempo"]);
		expect(timelineKinds([{ kind: "key", start: 30, value: "Bm" }])).toEqual(["key"]);
	});
	test("lanes come in the fixed order tempo, key, meter", () => {
		const changes: SongChange[] = [
			at0("meter", "4/4"),
			{ kind: "meter", start: 60, value: "6/8" },
			at0("tempo", "120"),
			{ kind: "tempo", start: 60, value: "90" },
		];
		expect(timelineKinds(changes)).toEqual(["tempo", "meter"]);
	});
});

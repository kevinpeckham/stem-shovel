import { describe, expect, test } from "vite-plus/test";
import { songChangesToStudio, studioChangesToSong, studioKeyAt } from "./studioChanges";

describe("songChangesToStudio", () => {
	test("the first of each kind is the song's own; the rest are changes on the ruler", () => {
		expect(
			songChangesToStudio([
				{ kind: "key", start: 60, value: "A minor" },
				{ kind: "tempo", start: 0, value: "96" },
				{ kind: "meter", start: 0, value: "6/8" },
				{ kind: "tempo", start: 30, value: "120" },
				{ kind: "key", start: 0, value: "C major" },
				{ kind: "meter", start: 45.5, value: "4/4" },
			]),
		).toEqual({
			// The player's 96 in 6/8 is 96 eighths a minute: Dawn's 48 quarter notes (audio/measures.ts); the bottom number rides along.
			bpm: 48,
			beatsPerBar: 6,
			beatUnit: 8,
			tempoChanges: [{ start: 30, bpm: 60 }],
			meterChanges: [{ start: 45.5, beatsPerBar: 4 }],
			key: "C major",
			keyChanges: [{ start: 60, key: "A minor" }],
		});
	});
	test("defaults without changes; a tempo clamped to Dawn's range; an odd meter left out", () => {
		expect(songChangesToStudio([])).toEqual({ bpm: 120, beatsPerBar: 4 });
		expect(
			songChangesToStudio([
				{ kind: "tempo", start: 0, value: "20" },
				{ kind: "meter", start: 0, value: "12/8" },
			]),
		).toEqual({ bpm: 30, beatsPerBar: 4 });
	});
});

describe("studioChangesToSong", () => {
	test("tempo, meter over quarters and key at zero, then the changes in time order", () => {
		expect(
			studioChangesToSong({
				bpm: 100,
				beatsPerBar: 3,
				key: "D",
				tempoChanges: [{ start: 20, bpm: 110 }],
				meterChanges: [{ start: 10, beatsPerBar: 4 }],
				keyChanges: [{ start: 15, key: "G" }],
			}),
		).toEqual([
			{ kind: "tempo", start: 0, value: "100" },
			{ kind: "meter", start: 0, value: "3/4" },
			{ kind: "key", start: 0, value: "D" },
			{ kind: "meter", start: 10, value: "4/4" },
			{ kind: "key", start: 15, value: "G" },
			{ kind: "tempo", start: 20, value: "110" },
		]);
		expect(studioChangesToSong({ bpm: 120, beatsPerBar: 4 })).toHaveLength(2);
		// The other way for 6/8: Dawn's 60 quarter notes a minute are the player's 120 eighths.
		expect(studioChangesToSong({ bpm: 60, beatsPerBar: 6, beatUnit: 8 })).toEqual([
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "6/8" },
		]);
	});
	test("the two directions round-trip", () => {
		const changes = studioChangesToSong({
			bpm: 90,
			beatsPerBar: 5,
			key: "E minor",
			keyChanges: [{ start: 8, key: "G major" }],
		});
		expect(songChangesToStudio(changes)).toEqual({
			bpm: 90,
			beatsPerBar: 5,
			key: "E minor",
			keyChanges: [{ start: 8, key: "G major" }],
		});
	});
});

describe("studioKeyAt", () => {
	test("the song's key until a change, then the change's", () => {
		const a = {
			key: "C",
			keyChanges: [
				{ start: 10, key: "F" },
				{ start: 20, key: "G" },
			],
		};
		expect(studioKeyAt(a, 0)).toBe("C");
		expect(studioKeyAt(a, 10)).toBe("F");
		expect(studioKeyAt(a, 25)).toBe("G");
		expect(studioKeyAt({}, 5)).toBe("");
	});
});

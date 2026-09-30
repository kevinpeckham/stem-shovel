import { describe, expect, test } from "vite-plus/test";
import { PIANO_KEY_CODES, PIANO_KEY_LABELS } from "$lib/constants/piano";
import { DEFAULT_PIANO_PREFERENCES, parsePianoPreferences } from "./pianoPreferences";

describe("parsePianoPreferences", () => {
	test("keeps what is valid and falls back for the rest", () => {
		expect(
			parsePianoPreferences({
				instrument: "organ",
				octave: 5,
				volume: 0.5,
				reverb: 2,
				hires: true,
			}),
		).toEqual({
			instrument: "organ",
			octave: 5,
			volume: 0.5,
			reverb: 1,
			reverbSize: 0.35,
			hires: true,
			key: null,
			degrees: false,
			labels: true,
			delay: { time: 0.35, feedback: 0.35, level: 0, analog: false },
			chorus: { rate: 0.8, depth: 0.5, mix: 0 },
			tremolo: { rate: 5, depth: 0, shape: "sine" },
		});
		// The effects clamp to their ranges; an unknown tremolo shape and a non-boolean analog flag fall back.
		expect(
			parsePianoPreferences({
				delay: { time: 3, feedback: 1, level: 0.5, analog: "yes" },
				chorus: { rate: 9, depth: 0.2, mix: 0.3 },
				tremolo: { rate: 0.1, depth: 2, shape: "saw" },
			}),
		).toMatchObject({
			delay: { time: 1, feedback: 0.9, level: 0.5, analog: false },
			chorus: { rate: 5, depth: 0.2, mix: 0.3 },
			tremolo: { rate: 0.5, depth: 1, shape: "sine" },
		});
		// An unknown sound and a wild volume fall back; an octave off the keyboard is clamped to it.
		expect(parsePianoPreferences({ instrument: "kazoo", octave: 42, volume: "loud" })).toEqual({
			...DEFAULT_PIANO_PREFERENCES,
			octave: 6,
		});
		expect(parsePianoPreferences(null)).toEqual(DEFAULT_PIANO_PREFERENCES);
	});
});

describe("the computer keyboard map", () => {
	test("every semitone of the two rows has one key and a label, and the rows meet an octave apart", () => {
		const semitones = Object.values(PIANO_KEY_CODES);
		for (let s = 0; s <= 31; s++) expect(semitones, `semitone ${s}`).toContain(s);
		expect(PIANO_KEY_CODES.KeyQ).toBe(PIANO_KEY_CODES.KeyZ! + 12);
		expect(PIANO_KEY_CODES.Comma).toBe(PIANO_KEY_CODES.KeyQ);
		for (let s = 0; s <= 31; s++) expect(PIANO_KEY_LABELS[s], `label ${s}`).toBeTruthy();
	});
});

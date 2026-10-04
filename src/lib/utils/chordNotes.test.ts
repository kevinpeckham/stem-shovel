import { describe, expect, it } from "vite-plus/test";
import { chordMidi, chordName, noteMidi } from "./chordNotes";

describe("chordNotes", () => {
	it("puts middle C at MIDI 60", () => {
		expect(noteMidi(0, 4)).toBe(60);
		expect(noteMidi(9, 4)).toBe(69);
	});
	it("builds the triads in root position", () => {
		expect(chordMidi({ pitch: 0, quality: "major", seventh: null, voicing: "standard" })).toEqual([
			60, 64, 67,
		]);
		expect(chordMidi({ pitch: 9, quality: "minor", seventh: null, voicing: "standard" })).toEqual([
			69, 72, 76,
		]);
		expect(
			chordMidi({ pitch: 11, quality: "diminished", seventh: null, voicing: "standard" }),
		).toEqual([71, 74, 77]);
	});
	it("adds the seventh the chord's quality wants", () => {
		expect(
			chordMidi({ pitch: 0, quality: "major", seventh: "dominant", voicing: "standard" }),
		).toEqual([60, 64, 67, 70]);
		expect(
			chordMidi({ pitch: 0, quality: "major", seventh: "major7", voicing: "standard" }),
		).toEqual([60, 64, 67, 71]);
		expect(
			chordMidi({ pitch: 9, quality: "minor", seventh: "major7", voicing: "standard" }),
		).toEqual([69, 72, 76, 79]);
	});
	it("lays the voicings out as the chord player's enhancer did", () => {
		const c = (voicing: "spread" | "rich" | "bass" | "rootBass") =>
			chordMidi({ pitch: 0, quality: "major", seventh: null, voicing });
		expect(c("spread")).toEqual([48, 64, 79]);
		expect(c("rich")).toEqual([36, 48, 64, 67, 72]);
		expect(c("bass")).toEqual([36, 60, 64, 67]);
		expect(c("rootBass")).toEqual([48, 64, 67, 72]);
	});
	it("names chords", () => {
		expect(chordName("C", "major", null)).toBe("C");
		expect(chordName("C", "major", "dominant")).toBe("C7");
		expect(chordName("C", "major", "major7")).toBe("Cmaj7");
		expect(chordName("Am", "minor", "dominant")).toBe("Am7");
		expect(chordName("B°", "diminished", "dominant")).toBe("B°7");
	});
});

import { voiceChord } from "./chordNotes";

describe("inversions", () => {
	it("turns the triad over, the lowest notes up an octave", () => {
		const c = (inversion: number) =>
			voiceChord({ pitch: 0, intervals: [0, 4, 7], voicing: "standard", inversion });
		expect(c(0)).toEqual([60, 64, 67]);
		expect(c(1)).toEqual([64, 67, 72]);
		expect(c(2)).toEqual([67, 72, 76]);
	});
	it("keeps the extensions above and voices the turned triad", () => {
		expect(
			voiceChord({ pitch: 0, intervals: [0, 4, 7, 10], voicing: "standard", inversion: 1 }),
		).toEqual([64, 67, 70, 72]);
		expect(voiceChord({ pitch: 0, intervals: [0, 4, 7], voicing: "bass", inversion: 1 })).toEqual([
			40, 64, 67, 72,
		]);
	});
});

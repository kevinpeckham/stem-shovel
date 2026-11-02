import { describe, expect, it } from "vite-plus/test";
import { noteMidi, voiceChord } from "./chordNotes";

describe("chordNotes", () => {
	it("puts middle C at MIDI 60", () => {
		expect(noteMidi(0, 4)).toBe(60);
		expect(noteMidi(9, 4)).toBe(69);
	});
	it("lays the voicings out as the chord player's enhancer did", () => {
		const c = (voicing: "spread" | "rich" | "bass" | "rootBass") =>
			voiceChord({ pitch: 0, intervals: [0, 4, 7], voicing });
		expect(c("spread")).toEqual([48, 64, 79]);
		expect(c("rich")).toEqual([36, 48, 64, 67, 72]);
		expect(c("bass")).toEqual([36, 60, 64, 67]);
		expect(c("rootBass")).toEqual([48, 64, 67, 72]);
	});
});

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

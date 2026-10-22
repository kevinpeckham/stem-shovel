import { describe, expect, it } from "vite-plus/test";
import { clipNoteEvents } from "./clipNoteEvents";

describe("clipNoteEvents", () => {
	const clip = {
		start: 10,
		offset: 1,
		duration: 4,
		gain: 0.5,
		notes: [
			{ t: 0.5, d: 1, p: 60, v: 1 }, // before the offset: trimmed away
			{ t: 1, d: 1, p: 62, v: 0.8 },
			{ t: 4.5, d: 2, p: 64, v: 1 }, // runs past the end: cut
			{ t: 5, d: 1, p: 65, v: 1 }, // at the end: out
			{ t: 2, d: 0.5, p: 67, v: 0.5 },
		],
	};
	it("places the notes on the song's clock, within the clip, velocity by the clip's gain, sorted", () => {
		expect(clipNoteEvents(clip)).toEqual([
			{ at: 10, duration: 1, pitch: 62, velocity: 0.4 },
			{ at: 11, duration: 0.5, pitch: 67, velocity: 0.25 },
			{ at: 13.5, duration: 0.5, pitch: 64, velocity: 0.5 },
		]);
	});
	it("takes a window", () => {
		expect(clipNoteEvents(clip, 10.5, 12).map((e) => e.pitch)).toEqual([67]);
		expect(clipNoteEvents(clip, 0, 10.5).map((e) => e.pitch)).toEqual([62]);
		expect(clipNoteEvents(clip, 0, 10.5)[0]!.duration).toBe(0.5);
	});
	it("sounds a looped clip's notes in every pass, each cut at the pass's end", () => {
		const looped = {
			start: 10,
			offset: 1,
			duration: 4,
			gain: 1,
			loop: { start: 1, end: 2 },
			notes: [
				{ t: 1, d: 0.5, p: 60, v: 1 },
				{ t: 1.75, d: 1, p: 62, v: 1 },
				{ t: 2.5, d: 1, p: 64, v: 1 }, // past the loop: never
			],
		};
		expect(clipNoteEvents(looped).map((e) => [e.at, e.duration, e.pitch])).toEqual([
			[10, 0.5, 60],
			[10.75, 0.25, 62],
			[11, 0.5, 60],
			[11.75, 0.25, 62],
			[12, 0.5, 60],
			[12.75, 0.25, 62],
			[13, 0.5, 60],
			[13.75, 0.25, 62],
		]);
		expect(clipNoteEvents(looped, 11.5, 12.5).map((e) => e.at)).toEqual([11.75, 12]);
	});
	it("is empty for an audio clip", () => {
		expect(clipNoteEvents({ start: 0, offset: 0, duration: 1, gain: 1 })).toEqual([]);
	});
});

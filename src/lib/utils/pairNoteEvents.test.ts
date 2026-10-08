import { describe, expect, it } from "vite-plus/test";
import { pairNoteEvents, type NoteEvent } from "./pairNoteEvents";

const on = (pitch: number, time: number, velocity = 0.8): NoteEvent => ({
	on: true,
	pitch,
	velocity,
	time,
});
const off = (pitch: number, time: number): NoteEvent => ({ on: false, pitch, velocity: 0, time });

describe("pairNoteEvents", () => {
	it("pairs each on with its off, timed from the pass's start less the shift", () => {
		const notes = pairNoteEvents(
			[on(60, 10.5), off(60, 11.0), on(64, 10.75, 0.5), off(64, 11.25)],
			{ from: 10, shift: 0.02, end: 20 },
		);
		expect(notes).toEqual([
			{ t: 0.48, d: 0.5, p: 60, v: 0.8 },
			{ t: 0.73, d: 0.5, p: 64, v: 0.5 },
		]);
	});
	it("ends a note still down at the end of the take, and an on before the pass starts counts from zero", () => {
		expect(pairNoteEvents([on(60, 9.9)], { from: 10, shift: 0, end: 12 })).toEqual([
			{ t: 0, d: 2, p: 60, v: 0.8 },
		]);
	});
	it("ignores an off with no on, and a restrike ends the first note where the second begins", () => {
		expect(
			pairNoteEvents([off(60, 10.2), on(60, 10.3), on(60, 10.6), off(60, 11)], {
				from: 10,
				shift: 0,
				end: 12,
			}),
		).toEqual([
			{ t: 0.3, d: 0.3, p: 60, v: 0.8 },
			{ t: 0.6, d: 0.4, p: 60, v: 0.8 },
		]);
	});
	it("sorts by start then pitch whatever order the events arrived in, clamps velocity, and keeps a minimum length", () => {
		const notes = pairNoteEvents(
			[
				off(67, 10.5),
				on(67, 10.5, 1.4),
				on(60, 10.5, -1),
				off(60, 10.9),
				on(48, 10.1),
				off(48, 10.4),
			],
			{ from: 10, shift: 0, end: 12 },
		);
		// The off before the on at the same moment is an off with no on: the note runs to the end.
		expect(notes).toEqual([
			{ t: 0.1, d: 0.3, p: 48, v: 0.8 },
			{ t: 0.5, d: 0.4, p: 60, v: 0 },
			{ t: 0.5, d: 1.5, p: 67, v: 1 },
		]);
		expect(pairNoteEvents([on(60, 10), off(60, 10)], { from: 10, shift: 0, end: 12 })).toEqual([
			{ t: 0, d: 0.001, p: 60, v: 0.8 },
		]);
	});
	it("answers nothing for no events", () => {
		expect(pairNoteEvents([], { from: 0, shift: 0, end: 1 })).toEqual([]);
	});
});

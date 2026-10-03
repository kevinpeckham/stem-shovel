import { describe, expect, test } from "vite-plus/test";
import { HeldNotes } from "./heldNotes";

describe("HeldNotes", () => {
	test("a press starts a voice once; a release without the pedal stops it", () => {
		const h = new HeldNotes();
		expect(h.on(60)).toBe(true);
		expect(h.on(60)).toBe(false);
		expect(h.sounding).toEqual([60]);
		expect(h.off(60)).toBe(true);
		expect(h.off(60)).toBe(false);
		expect(h.sounding).toEqual([]);
	});
	test("the pedal holds released notes until it comes up", () => {
		const h = new HeldNotes();
		h.setSustain(true);
		h.on(60);
		h.on(64);
		expect(h.off(60)).toBe(false);
		expect(h.sounding).toEqual([60, 64]);
		// Pressing a note the pedal holds strikes it again: a new voice (the engine releases the old one).
		expect(h.on(60)).toBe(true);
		expect(h.off(60)).toBe(false);
		expect(h.setSustain(false)).toEqual([60]);
		expect(h.sounding).toEqual([64]);
		expect(h.off(64)).toBe(true);
	});
	test("clear returns everything sounding", () => {
		const h = new HeldNotes();
		h.setSustain(true);
		h.on(60);
		h.off(60);
		h.on(67);
		expect(h.clear().sort((a, b) => a - b)).toEqual([60, 67]);
		expect(h.sounding).toEqual([]);
	});
});

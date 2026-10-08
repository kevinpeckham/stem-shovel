import { describe, expect, it } from "vite-plus/test";
import { editNotes, rollNoteLabel, rollRows, snapRollTime } from "./pianoRoll";

const n = (t: number, p: number, d = 0.5, v = 0.8) => ({ t, d, p, v });

describe("rollNoteLabel", () => {
	it("names a keyboard note by letter, sharp and octave, middle C being C4", () => {
		expect(rollNoteLabel(60, false)).toBe("C4");
		expect(rollNoteLabel(61, false)).toBe("C♯4");
		expect(rollNoteLabel(21, false)).toBe("A0");
	});
	it("names a drums track's note by its voice, falling back to the pitch", () => {
		expect(rollNoteLabel(36, true)).toBe("Kick");
		expect(rollNoteLabel(42, true)).toBe("Closed hat");
		expect(rollNoteLabel(60, true)).toBe("C4");
	});
});

describe("rollRows", () => {
	it("spans whole octaves around the notes, highest first, two octaves around middle C for few notes", () => {
		const rows = rollRows([n(0, 64)], false);
		expect(rows[0]).toEqual({ pitch: 95, label: "B6", black: false });
		expect(rows[rows.length - 1]).toEqual({ pitch: 48, label: "C3", black: false });
		expect(rows.find((r) => r.pitch === 61)?.black).toBe(true);
		expect(rows.find((r) => r.pitch === 60)?.black).toBe(false);
		expect(rows).toHaveLength(48);
	});
	it("widens to hold low and high notes and stays within MIDI's range", () => {
		const rows = rollRows([n(0, 3), n(1, 125)], false);
		expect(rows[0].pitch).toBe(127);
		expect(rows[rows.length - 1].pitch).toBe(0);
	});
	it("lists the drum voices for a drums track, plus any other note the clip holds", () => {
		const rows = rollRows([n(0, 36), n(0, 70)], true);
		expect(rows[0]).toEqual({ pitch: 70, label: "A♯4", black: false });
		expect(rows.map((r) => r.label)).toContain("Kick");
		expect(rows.map((r) => r.label)).toContain("Cowbell");
		expect(rows.every((r) => !r.black)).toBe(true);
		expect(rows.map((r) => r.pitch)).toEqual(rows.map((r) => r.pitch).toSorted((a, b) => b - a));
	});
});

describe("editNotes", () => {
	const notes = [n(0, 60), n(0.5, 64), n(1, 67)];
	it("moves the selected notes in time and pitch, never before zero nor outside MIDI", () => {
		expect(editNotes(notes, [0, 2], { kind: "move", dt: -0.25, dp: 70 })).toEqual([
			n(0, 127),
			n(0.5, 64),
			n(0.75, 127),
		]);
	});
	it("lengthens or shortens, never under the minimum", () => {
		expect(editNotes(notes, [1], { kind: "resize", dd: -1 })).toEqual([
			n(0, 60),
			n(0.5, 64, 0.05),
			n(1, 67),
		]);
		expect(editNotes(notes, [1], { kind: "resize", dd: 0.25 }, 0.1)[1].d).toBe(0.75);
	});
	it("sets a velocity within 0..1 and deletes", () => {
		expect(editNotes(notes, [0, 1], { kind: "velocity", v: 1.5 }).map((x) => x.v)).toEqual([
			1, 1, 0.8,
		]);
		expect(editNotes(notes, [1], { kind: "delete" })).toEqual([n(0, 60), n(1, 67)]);
	});
	it("leaves the unselected alone and keeps the order", () => {
		const out = editNotes(notes, [2], { kind: "move", dt: -0.9, dp: 0 });
		expect(out[0]).toBe(notes[0]);
		expect(out[2].t).toBe(0.1);
	});
});

describe("snapRollTime", () => {
	it("snaps to the nearest step, never before zero, and leaves time alone for no step", () => {
		expect(snapRollTime(0.74, 0.5)).toBe(0.5);
		expect(snapRollTime(0.76, 0.5)).toBe(1);
		expect(snapRollTime(-0.3, 0.5)).toBe(0);
		expect(snapRollTime(0.33, 0)).toBe(0.33);
	});
});

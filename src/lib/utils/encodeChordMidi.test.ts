import { describe, expect, it } from "vite-plus/test";
import { parseMidi } from "$lib/audio/midi";
import type { ProgressionEntry } from "./chordRhythm";
import { encodeChordMidi } from "./encodeChordMidi";

const entries: ProgressionEntry[] = [
	{ kind: "chord", label: "C", wedge: "C", notes: [60, 64, 67], beats: 2 },
	{ kind: "rest", beats: 1 },
	{ kind: "chord", label: "G", wedge: "G", notes: [55, 59], beats: 1 },
];

describe("encodeChordMidi", () => {
	it("holds each chord for its beats less a sixteenth, a rest a gap, at the tempo", async () => {
		const { notes, duration } = parseMidi(await encodeChordMidi(entries, 120, 4).arrayBuffer());
		// At 120 bpm a beat is half a second; the C lets go a sixteenth (0.125 s) before its two beats are up.
		expect(notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
			[60, 0, 0.875],
			[64, 0, 0.875],
			[67, 0, 0.875],
			[55, 1.5, 0.375],
			[59, 1.5, 0.375],
		]);
		expect(notes.every((n) => n.channel === 0 && n.velocity === 90)).toBe(true);
		expect(duration).toBe(1.875);
	});
	it("takes a velocity and writes a piano program and the meter first", async () => {
		const blob = encodeChordMidi(entries.slice(0, 1), 60, 3, 40);
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
		expect(hex).toContain("00 ff 51 03 0f 42 40 00 ff 58 04 03 02 18 08 00 c0 00");
		expect(parseMidi(bytes.buffer).notes[0]).toEqual({
			start: 0,
			duration: 1.75,
			pitch: 60,
			velocity: 40,
			channel: 0,
		});
	});
});

import { describe, expect, it } from "vite-plus/test";
import { parseMidi } from "#lib/audio/midi.js";
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
			track: 0,
		});
	});
	it("humanizes each chord's onset and velocity together, clamped at the start", async () => {
		// Full humanize at 120 bpm: +30 ms is round(0.03 × 96 × 2) = 6 ticks, 6/192 s; velocity 90 × 1.2.
		const late = parseMidi(
			await encodeChordMidi(entries, 120, 4, 90, { humanize: 1, random: () => 1 }).arrayBuffer(),
		).notes;
		expect(late.slice(0, 3).map((n) => [n.start, n.duration, n.velocity])).toEqual([
			[0.03125, 0.875, 108],
			[0.03125, 0.875, 108],
			[0.03125, 0.875, 108],
		]);
		expect(late[3]!.start).toBe(1.53125);
		// Early: the first chord cannot start before 0; velocity 90 × 0.8.
		const early = parseMidi(
			await encodeChordMidi(entries, 120, 4, 90, { humanize: 1, random: () => 0 }).arrayBuffer(),
		).notes;
		expect(early[0]).toMatchObject({ start: 0, velocity: 72 });
		expect(early[3]!.start).toBe(1.46875);
	});
	it("is byte-identical to the exact file at humanize 0", async () => {
		const bytes = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));
		const exact = await bytes(encodeChordMidi(entries, 120, 4));
		expect(await bytes(encodeChordMidi(entries, 120, 4, 90, { humanize: 0 }))).toEqual(exact);
		expect(await bytes(encodeChordMidi(entries, 120, 4, 90, {}))).toEqual(exact);
	});
});

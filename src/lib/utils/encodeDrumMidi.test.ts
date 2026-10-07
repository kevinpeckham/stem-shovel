import { describe, expect, it } from "vite-plus/test";
import { parseMidi } from "$lib/audio/midi";
import type { DrumPattern } from "$lib/val/DrumPatternSchema";
import { encodeDrumMidi } from "./encodeDrumMidi";

const row = (voice: DrumPattern["rows"][number]["voice"], level: number, cells: number[]) => ({
	voice,
	level,
	pan: 0,
	mute: false,
	delaySend: 0,
	reverbSend: 0,
	cells,
});
/** Eight steps of 4/4 at 120 bpm: a step is 24 ticks, 0.125 s. */
const bar: DrumPattern = {
	meter: "4/4",
	steps: 8,
	rows: [
		row("kick", 1, [2, 0, 0, 0, 3, 0, 0, 0]),
		row("hat-closed", 0.5, [0, 1, 0, 0, 0, 0, 0, 0]),
		{ ...row("snare", 1, [0, 0, 2, 0, 0, 0, 2, 0]), mute: true },
	],
};
const parse = async (blob: Blob) => parseMidi(await blob.arrayBuffer()).notes;

describe("encodeDrumMidi", () => {
	it("puts each hit on channel 10 at its step, velocity from the cell and the level, muted rows left out", async () => {
		expect(await parse(encodeDrumMidi(bar, 120, 0))).toEqual([
			{ start: 0, duration: 0.0625, pitch: 36, velocity: 100, channel: 9 },
			{ start: 0.125, duration: 0.0625, pitch: 42, velocity: 38, channel: 9 },
			{ start: 0.5, duration: 0.0625, pitch: 36, velocity: 127, channel: 9 },
		]);
	});
	it("moves a swung step late, as the player does", async () => {
		const notes = await parse(encodeDrumMidi(bar, 120, 1));
		// Full swing on the 16 grid: the odd sixteenth lands a third of a step (8 ticks) late.
		expect(notes[1].start).toBeCloseTo((24 + 8) / 96 / 2, 6);
		expect(notes[0].start).toBe(0);
		// On the 8 grid step 1 stays put.
		expect((await parse(encodeDrumMidi(bar, 120, 1, 8)))[1].start).toBe(0.125);
	});
	it("lays a song of bars end to end and writes the time signature where it changes", async () => {
		const waltz: DrumPattern = { ...bar, meter: "3/4", steps: 12 };
		const blob = encodeDrumMidi([bar, waltz], 120, 0);
		const notes = await parse(blob);
		// The second bar starts 8 steps (192 ticks, a second) in.
		expect(notes.filter((n) => n.pitch === 36).map((n) => n.start)).toEqual([0, 0.5, 1, 1.5]);
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
		expect(hex).toContain("ff 58 04 04 02 18 08");
		expect(hex).toContain("ff 58 04 03 02 18 08");
	});
});

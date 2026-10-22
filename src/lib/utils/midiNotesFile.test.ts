import { describe, expect, it } from "vite-plus/test";
import { parseMidi } from "../audio/midi";
import {
	DRUM_CHANNEL,
	lanesFromMidiSummary,
	notesFromMidiSummary,
	notesToMidiBlob,
} from "./midiNotesFile";

const notes = [
	{ t: 0, d: 0.5, p: 60, v: 0.8 },
	{ t: 0.5, d: 0.25, p: 64, v: 1 },
	{ t: 0.5, d: 1, p: 67, v: 0.1 },
];

describe("notesToMidiBlob and notesFromMidiSummary", () => {
	it("writes a file the parser reads back with the same notes, timed at the song's tempo", async () => {
		const blob = notesToMidiBlob(notes, { bpm: 120, beatsPerBar: 3 });
		const summary = parseMidi(await blob.arrayBuffer());
		expect(summary.notes.map((n) => [n.start, n.duration, n.pitch, n.channel])).toEqual([
			[0, 0.5, 60, 0],
			[0.5, 0.25, 64, 0],
			[0.5, 1, 67, 0],
		]);
		expect(summary.duration).toBe(1.5);
		// Velocity rides as a 7-bit value: back within a step of 1/127.
		const back = notesFromMidiSummary(summary);
		expect(back.map(({ t, d, p }) => ({ t, d, p }))).toEqual(
			notes.map(({ t, d, p }) => ({ t, d, p })),
		);
		back.forEach((n, i) => expect(n.v).toBeCloseTo(notes[i].v, 2));
	});
	it("writes the expression changes as controller, bend and pressure events, and reads them back as lanes", async () => {
		const blob = notesToMidiBlob(notes, { bpm: 120, beatsPerBar: 4 }, [
			{ at: 0, kind: "cc", controller: 64, value: 1 },
			{ at: 1, kind: "bend", value: 0.75 },
			{ at: 1.25, kind: "pressure", value: 0.5 },
			{ at: 1.5, kind: "cc", controller: 64, value: 0 },
			{ at: 1.5, kind: "bend", value: 0.5 },
		]);
		const summary = parseMidi(await blob.arrayBuffer());
		expect(
			summary.controls!.map((c) => [c.at, c.kind, c.controller, Math.round(c.value * 100) / 100]),
		).toEqual([
			[0, "cc", 64, 1],
			[1, "bend", undefined, 0.75],
			[1.25, "pressure", undefined, 0.5],
			[1.5, "cc", 64, 0],
			[1.5, "bend", undefined, 0.5],
		]);
		const lanes = lanesFromMidiSummary(summary, 1.5);
		expect(lanes.map((l) => [l.kind, l.controller, l.points.length])).toEqual([
			["cc", 64, 1],
			["bend", undefined, 1],
			["pressure", undefined, 1],
		]);
		expect(lanes[0]!.points).toEqual([{ t: 0, v: 1 }]);
		expect(lanes[1]!.points[0]!.v).toBeCloseTo(0.75, 3);
	});
	it("puts a drums track's notes on channel 10 and keeps a momentary note at least a tick long", async () => {
		const blob = notesToMidiBlob([{ t: 0, d: 0.0001, p: 36, v: 0.5 }], {
			bpm: 60,
			beatsPerBar: 4,
			drums: true,
		});
		const summary = parseMidi(await blob.arrayBuffer());
		expect(summary.notes[0]).toMatchObject({ pitch: 36, channel: DRUM_CHANNEL });
		expect(summary.notes[0].duration).toBeGreaterThan(0);
	});
	it("normalizes a parsed file's values: velocity to 0..1, pitch and times clamped and rounded", () => {
		expect(
			notesFromMidiSummary({
				notes: [
					{ start: -0.1, duration: 0, pitch: 130, velocity: 100, channel: 0, track: 0 },
					{ start: 1.23456, duration: 0.5, pitch: 60, velocity: 0.5, channel: 0, track: 0 },
				],
				duration: 2,
				lowest: 60,
				highest: 130,
			}),
		).toEqual([
			{ t: 0, d: 0.001, p: 127, v: 100 / 127 },
			{ t: 1.2346, d: 0.5, p: 60, v: 0.5 },
		]);
	});
});

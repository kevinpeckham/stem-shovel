import { parseMidi } from "#lib/audio/midi.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { audacityLabels } from "./audacityLabels";
import { sessionMidi } from "./sessionMidi";

const track = (
	id: string,
	name: string,
	extra: Partial<StudioArrangement["tracks"][number]> = {},
) => ({
	id,
	name,
	gain: 1,
	pan: 0,
	muted: false,
	solo: false,
	armed: false,
	input: null,
	...extra,
});

/** Four bars of 4/4 at 120 (8 s), then 3/4 at 90 in F# minor from the "Bridge" marker; a piano part and a drum part. */
const arrangement: StudioArrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 1,
	key: "A major",
	keyChanges: [{ start: 8, key: "F#m" }],
	tempoChanges: [{ start: 8, bpm: 90 }],
	meterChanges: [{ start: 8, beatsPerBar: 3 }],
	markers: [
		{ id: "m2", t: 8, name: "Bridge" },
		{ id: "m1", t: 0, name: "Intro" },
	],
	tracks: [
		track("a", "Guitar"),
		track("p", "Piano", { kind: "midi", input: { source: "piano", channel: "stereo" } }),
		track("d", "Drums", { kind: "midi", input: { source: "drums", channel: "stereo" } }),
		track("e", "Empty MIDI", { kind: "midi" }),
	],
	clips: [
		{
			id: "c0",
			trackId: "a",
			sourceId: "s1",
			start: 0,
			offset: 0,
			duration: 12,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Take",
		},
		{
			id: "c1",
			trackId: "p",
			notes: [
				{ t: 0, d: 0.5, p: 60, v: 1 },
				// At 9 s: a second into the 90 bpm stretch, 16 beats + 1.5 beats.
				{ t: 9, d: 1, p: 64, v: 0.5 },
			],
			start: 0,
			offset: 0,
			duration: 12,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Chords",
		},
		{
			id: "c2",
			trackId: "d",
			notes: [{ t: 0, d: 0.25, p: 36, v: 1 }],
			start: 2,
			offset: 0,
			duration: 2,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Kick",
		},
	],
};

describe("sessionMidi", () => {
	it("writes a format 1 file whose conductor carries the tempo map, meters, keys and markers in order, read back in seconds", async () => {
		const blob = sessionMidi(arrangement, "Eat All the Clocks");
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("MThd");
		expect((bytes[8]! << 8) | bytes[9]!).toBe(1); // format
		expect((bytes[10]! << 8) | bytes[11]!).toBe(3); // conductor + piano + drums; the empty MIDI track is left out
		const m = parseMidi(bytes.buffer);
		expect(m.trackNames).toEqual(["Eat All the Clocks", "Piano", "Drums"]);
		expect(m.tempos).toEqual([
			{ at: 0, bpm: 120 },
			{ at: 8, bpm: 90 },
		]);
		expect(m.meters).toEqual([
			{ at: 0, numerator: 4, denominator: 4 },
			{ at: 8, numerator: 3, denominator: 4 },
		]);
		expect(m.keys).toEqual([
			{ at: 0, sharps: 3, minor: false },
			{ at: 8, sharps: 3, minor: true },
		]);
		expect(m.markers).toEqual([
			{ at: 0, name: "Intro" },
			{ at: 8, name: "Bridge" },
		]);
	});
	it("lays the notes at their seconds through the tempo map, the drums on channel 10", async () => {
		const m = parseMidi(await sessionMidi(arrangement, "Song").arrayBuffer());
		const notes = m.notes.map((n) => [
			n.channel,
			n.pitch,
			Math.round(n.start * 1000) / 1000,
			Math.round(n.duration * 1000) / 1000,
			n.velocity,
		]);
		expect(notes).toEqual([
			[0, 60, 0, 0.5, 127],
			[9, 36, 2, 0.25, 127],
			[0, 64, 9, 1, 64],
		]);
	});
	it("skips a key a signature cannot say and still writes the rest", async () => {
		const m = parseMidi(
			await sessionMidi({ ...arrangement, key: "D dorian", keyChanges: [] }, "Modal").arrayBuffer(),
		);
		expect(m.keys).toEqual([]);
		expect(m.markers?.length).toBe(2);
	});
});

describe("audacityLabels", () => {
	it("lists the song's own values at zero, then every change and marker by time, tab-separated", () => {
		expect(audacityLabels(arrangement)).toBe(
			[
				"0.000000\t0.000000\tTempo 120",
				"0.000000\t0.000000\tMeter 4/4",
				"0.000000\t0.000000\tKey A major",
				"0.000000\t0.000000\tIntro",
				"8.000000\t8.000000\tTempo 90",
				"8.000000\t8.000000\tMeter 3/4",
				"8.000000\t8.000000\tKey F#m",
				"8.000000\t8.000000\tBridge",
				"",
			].join("\n"),
		);
	});
});

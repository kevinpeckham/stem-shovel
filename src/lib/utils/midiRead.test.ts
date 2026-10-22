import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import {
	midiFile,
	midiFileTracks,
	midiNoteOff,
	midiNoteOn,
	midiProgram,
	midiTempo,
	midiTrackName,
} from "./midiFile";
import { readMidi } from "./midiRead";
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

/** The session bundle's own MIDI file (utils/sessionMidi.ts): four bars at 120, then 3/4 at 90 in F# minor from "Bridge". */
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
		track("p", "Piano", { kind: "midi", input: { source: "piano", channel: "stereo" } }),
		track("d", "Drums", { kind: "midi", input: { source: "drums", channel: "stereo" } }),
	],
	clips: [
		{
			id: "c1",
			trackId: "p",
			notes: [
				{ t: 0, d: 0.5, p: 60, v: 1 },
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

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe("readMidi", () => {
	it("reads a format 1 file back into the arrangement the session bundle wrote it from: tempo map, meters, keys, markers, a track per part", async () => {
		const read = readMidi(await bytesOf(sessionMidi(arrangement, "Eat All the Clocks")), "file");
		const a = read.arrangement;
		expect(read.title).toBe("Eat All the Clocks");
		expect(a.bpm).toBe(120);
		expect(a.tempoChanges).toEqual([{ start: 8, bpm: 90 }]);
		expect(a.beatsPerBar).toBe(4);
		expect(a.meterChanges).toEqual([{ start: 8, beatsPerBar: 3 }]);
		expect(a.key).toBe("A");
		expect(a.keyChanges).toEqual([{ start: 8, key: "F#m" }]);
		expect(a.markers!.map((m) => [m.t, m.name])).toEqual([
			[0, "Intro"],
			[8, "Bridge"],
		]);
		expect(a.tracks.map((t) => [t.name, t.kind, t.input?.source])).toEqual([
			["Piano", "midi", "piano"],
			["Drums", "midi", "drums"],
		]);
		expect(a.clips.map((c) => [c.name, c.start, c.duration, c.notes])).toEqual([
			[
				"Piano",
				0,
				10,
				[
					{ t: 0, d: 0.5, p: 60, v: 1 },
					{ t: 9, d: 1, p: 64, v: 0.5039 },
				],
			],
			["Drums", 2, 0.25, [{ t: 0, d: 0.25, p: 36, v: 1 }]],
		]);
		expect(read.files).toEqual([]);
		expect(read.dropped).toEqual([]);
		expect(read.fixed).toEqual([]);
	});

	it("reads a format 0 file's channels as the tracks, channel 10 as drums, and counts what it skips", async () => {
		const events = [
			midiTempo(0, 100),
			midiProgram(0, 0, 4),
			midiNoteOn(0, 0, 60, 100),
			midiNoteOff(96, 0, 60),
			midiNoteOn(96, 9, 36, 127),
			midiNoteOff(120, 9, 36),
		];
		const read = readMidi(await bytesOf(midiFile(events)), "beat");
		const a = read.arrangement;
		expect(a.bpm).toBe(100);
		expect(a.tracks.map((t) => [t.name, t.input?.source])).toEqual([
			["Channel 1", "piano"],
			["Drums", "drums"],
		]);
		expect(a.clips.map((c) => [c.start, c.duration])).toEqual([
			[0, 0.6],
			[0.6, 0.15],
		]);
		expect(read.fixed).toContain("No time signature in the file: 4/4 assumed");
		expect(read.dropped).toEqual(["1 controller, pitch-bend, pressure or program-change event"]);
		// One channel alone: the track's name, else the file's.
		const one = readMidi(await bytesOf(midiFile(events.slice(0, 4))), "beat");
		expect(one.arrangement.tracks.map((t) => t.name)).toEqual(["beat"]);
	});

	it("names a format 1 file's empty tracks among what is dropped, and refuses what is not MIDI", async () => {
		const blob = midiFileTracks([
			{ events: [midiTrackName(0, "Song"), midiTempo(0, 120)] },
			{ events: [midiTrackName(0, "Lead"), midiNoteOn(0, 0, 72, 90), midiNoteOff(48, 0, 72)] },
			{ events: [midiTrackName(0, "Spare")] },
		]);
		const read = readMidi(await bytesOf(blob), "file");
		expect(read.title).toBe("Song");
		expect(read.arrangement.tracks.map((t) => t.name)).toEqual(["Lead"]);
		expect(read.dropped).toEqual(["Spare: a track with no notes"]);
		expect(() => readMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toThrow(
			/Not a MIDI file/,
		);
	});
});

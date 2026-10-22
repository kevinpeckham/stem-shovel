import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { sandProject } from "./sandProject";

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

const arrangement: StudioArrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 3,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 0.8,
	key: "F#m",
	tempoChanges: [{ start: 8, bpm: 90 }],
	markers: [{ id: "m1", t: 0, name: "Intro" }],
	tracks: [
		track("a", "Guitar", { gain: 0.7, pan: -0.25, muted: true, colour: "rose" }),
		track("p", "Piano", { kind: "midi", solo: true }),
		track("e", "Lost source"),
	],
	clips: [
		{
			id: "c1",
			trackId: "a",
			sourceId: "s1",
			start: 2.5,
			offset: 1,
			duration: 4,
			gain: 0.5,
			fadeIn: 0.5,
			fadeOut: 1,
			name: "Take 1",
		},
		{
			id: "c3",
			trackId: "a",
			sourceId: "s1",
			start: 0,
			offset: 0,
			duration: 2,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Take 0",
		},
		{
			id: "c2",
			trackId: "p",
			notes: [
				{ t: 0.5, d: 0.25, p: 60, v: 1 },
				// Before the clip's start (offset 1 s hides it): dropped.
				{ t: 1.5, d: 0.5, p: 64, v: 0.5 },
			],
			start: 4,
			offset: 1,
			duration: 2,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Chords",
		},
		{
			id: "c4",
			trackId: "e",
			sourceId: "gone",
			start: 0,
			offset: 0,
			duration: 1,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Lost",
		},
	],
};

describe("sandProject", () => {
	const json = sandProject({
		title: "Exiles & Endtimes",
		arrangement,
		audio: new Map([
			["s1", { path: "samples/s1.wav", durationSeconds: 30, sampleRate: 48000, channels: 2 }],
		]),
		application: { name: "Stem Shovel Dawn", version: "0.141.0" },
	});
	const p = JSON.parse(json);
	it("writes the song's tempo, meter, master and key as the project's globals", () => {
		expect(p.version).toBe(1);
		expect(p.projectTitle).toBe("Exiles & Endtimes");
		expect(p.comment).toBe("Exported from Stem Shovel Dawn 0.141.0");
		expect(p.global).toMatchObject({
			bpm: 120,
			beatsPerBar: 3,
			beatUnit: 4,
			masterVolume: 0.8,
			scaleRoot: 6,
			scaleType: 1,
		});
	});
	it("writes a sample track per audio track and a synth track per MIDI track, numbered from one", () => {
		expect(
			p.tracks.map((t: any) => [
				t.trackId,
				t.index,
				t.type,
				t.name,
				t.volume,
				t.pan,
				t.mute,
				t.solo,
				t.color,
				t.internalInstrumentId,
				t.contentIds,
			]),
		).toEqual([
			[
				1,
				0,
				1,
				"Guitar",
				0.7,
				-0.25,
				true,
				false,
				expect.stringMatching(/^[0-9A-F]{6}$/),
				undefined,
				[1, 2],
			],
			[2, 1, 0, "Piano", 1, 0, false, true, expect.any(String), "synth", [3]],
			[3, 2, 1, "Lost source", 1, 0, false, false, expect.any(String), undefined, []],
		]);
		expect(p.nextTrackId).toBe(4);
		expect(p.nextContentId).toBe(4);
	});
	it("writes the clips in beats at the song's tempo: a sample over its file from its offset with gain and fades, in time order", () => {
		const [c0, c1] = p.contents;
		expect(c0).toMatchObject({
			id: 1,
			trackIndex: 0,
			type: 1,
			name: "Take 0",
			startBeat: 0,
			lengthBeats: 4,
			contentStartOffset: 0,
			sampleFilePath: "samples/s1.wav",
		});
		expect(c1).toMatchObject({
			id: 2,
			trackIndex: 0,
			type: 1,
			name: "Take 1",
			startBeat: 5,
			lengthBeats: 8,
			contentStartOffset: 2,
			sampleGain: 0.5,
			fadeInBeats: 1,
			fadeOutBeats: 2,
			sampleRate: 48000,
			sampleLengthSeconds: 30,
		});
	});
	it("writes a notes clip's notes relative to the clip in beats with velocity 0..127, the hidden note dropped", () => {
		const notes = p.contents[2];
		expect(notes).toMatchObject({
			id: 3,
			trackIndex: 1,
			type: 0,
			name: "Chords",
			startBeat: 8,
			lengthBeats: 4,
			contentStartOffset: 0,
		});
		// The note at 1.5 s into the content, offset 1 s: half a second after the clip's start, a beat in.
		expect(notes.notesData).toEqual([{ note: 64, velocity: 64, start: 1, duration: 1 }]);
	});
	it("lays a looped clip out as a content per pass, the fades at the outer edges", () => {
		const looped = JSON.parse(
			sandProject({
				title: "Loop",
				arrangement: {
					...arrangement,
					clips: [{ ...arrangement.clips[0]!, offset: 1, duration: 5, loop: { start: 1, end: 3 } }],
				},
				audio: new Map([
					["s1", { path: "samples/s1.wav", durationSeconds: 30, sampleRate: 48000, channels: 2 }],
				]),
				application: { name: "Stem Shovel Dawn", version: "0.141.0" },
			}),
		);
		// 2.5 s at 120 bpm is beat 5; passes of 2, 2 and 1 s (4, 4 and 2 beats).
		expect(
			looped.contents.map((c: Record<string, number>) => [
				c.startBeat,
				c.lengthBeats,
				c.contentStartOffset,
				c.fadeInBeats,
				c.fadeOutBeats,
			]),
		).toEqual([
			[5, 4, 2, 1, 0],
			[9, 4, 2, 0, 0],
			[13, 2, 2, 0, 2],
		]);
		expect(looped.tracks[0].contentIds).toEqual([1, 2, 3]);
	});

	it("leaves a clip without its audio out, and the key out when it is no key", () => {
		expect(p.contents.length).toBe(3);
		const noKey = JSON.parse(
			sandProject({
				title: "x",
				arrangement: { ...arrangement, key: "D dorian" },
				audio: new Map(),
				application: { name: "a", version: "1" },
			}),
		);
		expect(noKey.global.scaleRoot).toBeUndefined();
	});
});

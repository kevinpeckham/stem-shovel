import { describe, expect, it } from "vite-plus/test";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { rppProject } from "./rpp";
import { readRpp } from "./rppRead";

const arrangement: StudioArrangement = {
	version: 1,
	bpm: 120,
	beatsPerBar: 4,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 0.9,
	sampleRate: 48000,
	key: "A minor",
	keyChanges: [{ start: 8, key: "C major" }],
	tempoChanges: [{ start: 8, bpm: 100 }],
	meterChanges: [{ start: 8, beatsPerBar: 3 }],
	markers: [
		{ id: "m2", t: 8, name: "Verse" },
		{ id: "m1", t: 0, name: "Intro" },
	],
	buses: [{ id: "b1", name: "Drums", colour: "sea", gain: 0.8, pan: 0, muted: false }],
	tracks: [
		{
			id: "t-bass",
			name: "Bass",
			gain: 0.8,
			pan: -0.3,
			muted: false,
			solo: false,
			armed: false,
			input: null,
			sends: [{ bus: "b1", level: 0.5, pre: true }],
			automation: {
				volume: [
					{ t: 0, v: 1 },
					{ t: 4, v: 0.5 },
				],
				pan: [{ t: 0, v: -0.3 }],
			},
		},
		{
			id: "t-kick",
			name: "Kick",
			colour: "clay",
			gain: 1,
			pan: 0,
			muted: false,
			solo: true,
			armed: false,
			input: null,
			output: "b1",
		},
		{
			id: "t-hats",
			name: "Hats",
			gain: 1,
			pan: 0.2,
			muted: true,
			solo: false,
			armed: false,
			input: null,
			output: "b1",
		},
		{
			id: "t-keys",
			name: "Keys",
			kind: "midi",
			gain: 1,
			pan: 0,
			muted: false,
			solo: false,
			armed: false,
			input: { source: "piano", channel: "stereo" },
		},
	],
	clips: [
		{
			id: "c-bass",
			trackId: "t-bass",
			sourceId: "s-bass",
			start: 1.25,
			offset: 0.5,
			duration: 4,
			gain: 0.7,
			fadeIn: 0.5,
			fadeOut: 1,
			name: "Bass take",
		},
		{
			id: "c-kick",
			trackId: "t-kick",
			sourceId: "s-kick",
			start: 0,
			offset: 0,
			duration: 8,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Kick take",
		},
		{
			id: "c-lost",
			trackId: "t-hats",
			sourceId: "s-missing",
			start: 0,
			offset: 0,
			duration: 8,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Lost",
		},
		{
			id: "c-keys",
			trackId: "t-keys",
			start: 4,
			offset: 0,
			duration: 8,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Chords",
			// A chord at the clip's start, then a note across the tempo change at 8 s (4 s into the clip) and one after it.
			notes: [
				{ t: 0, d: 1, p: 57, v: 0.9 },
				{ t: 0, d: 1, p: 60, v: 0.8 },
				{ t: 3.5, d: 1, p: 72, v: 1 },
				{ t: 4.5, d: 0.5, p: 71, v: 0.6 },
			],
		},
	],
};
const audio = new Map([
	["s-bass", { path: "media/s-bass.wav", durationSeconds: 6, sampleRate: 48000, channels: 2 }],
	["s-kick", { path: "media/s-kick.wav", durationSeconds: 8, sampleRate: 48000, channels: 1 }],
]);
const app = { name: "Stem Shovel Dawn", version: "1.2.3" };

describe("rppProject", () => {
	const text = rppProject({ title: "Exiles", arrangement, audio, application: app });

	it("writes the project's lines: header, notes, rate, tempo map, markers, master, a folder per bus", () => {
		expect(text.startsWith('<REAPER_PROJECT 0.1 "7.0/Stem-Shovel-Dawn-1.2.3" ')).toBe(true);
		expect(text).toContain("    |Title: Exiles\n    |Key: A minor\n    |Key from 8 s: C major\n");
		expect(text).toContain("  SAMPLERATE 48000 0 0\n");
		expect(text).toContain("  TEMPO 120 4 4 0\n");
		expect(text).toContain(
			`    PT 0 120 1 ${(4 << 16) | 4} 0 1\n    PT 8 100 1 ${(4 << 16) | 3} 0 1\n`,
		);
		expect(text).toContain('  MARKER 1 0 "Intro" 0 0 1\n  MARKER 2 8 "Verse" 0 0 1\n');
		expect(text).toContain("  MASTER_VOLUME 0.9 0 -1 -1 1\n");
		// Bass goes to the master and comes first; the Drums folder holds Kick and Hats, Hats closing it.
		const names = [...text.matchAll(/^    NAME "(.+)"$/gm)].map((m) => m[1]);
		expect(names).toEqual(["Bass", "Keys", "Drums", "Kick", "Hats"]);
		expect(text).toContain(
			'    NAME "Drums"\n    PEAKCOL 29536895\n    VOLPAN 0.8 0 -1 -1 1\n    MUTESOLO 0 0 0\n    ISBUS 1 1\n',
		);
		expect(text).toContain(
			'    NAME "Hats"\n    VOLPAN 1 0.2 -1 -1 1\n    MUTESOLO 1 0 0\n    ISBUS 2 -1\n',
		);
		expect(text).toContain(
			'    NAME "Kick"\n    PEAKCOL 25074387\n    VOLPAN 1 0 -1 -1 1\n    MUTESOLO 0 1 0\n    ISBUS 0 0\n',
		);
		// The send from Bass (track 0) to Drums: a pre-fader receive on the folder.
		expect(text).toContain("    AUXRECV 0 3 0.5 0 0 0 0 0 0 -1 0 -1 0\n");
		// Envelopes: volume as it is, pan the other way up.
		expect(text).toContain(
			"    <VOLENV2\n      ACT 1 -1\n      VIS 1 1 1\n      ARM 0\n      DEFSHAPE 0 -1 -1\n      PT 0 1 0\n      PT 4 0.5 0\n    >\n",
		);
		expect(text).toContain(
			"    <PANENV2\n      ACT 1 -1\n      VIS 1 1 1\n      ARM 0\n      DEFSHAPE 0 -1 -1\n      PT 0 0.3 0\n    >\n",
		);
	});

	it("writes an item per clip: audio over its file with offset, gain and fades; MIDI as ticks through the tempo map; a lost source left out", () => {
		expect(text).toContain(
			'    <ITEM\n      POSITION 1.25\n      LENGTH 4\n      FADEIN 1 0.5 0 1 0 0 0\n      FADEOUT 1 1 0 1 0 0 0\n      MUTE 0 0\n      NAME "Bass take"\n      VOLPAN 0.7 0 1 -1\n      SOFFS 0.5\n      PLAYRATE 1 1 0 -1 0 0.0025\n      <SOURCE WAVE\n        FILE "media/s-bass.wav"\n      >\n    >\n',
		);
		expect(text).not.toContain("Lost");
		// 960 ticks a quarter: the chord at 0, off after 2 quarters; the note at 3.5 s (7 quarters) lasting 1 s = 2 quarters
		// at 120 then... it crosses 8 s: half a second at 120 (1 quarter) and half at 100 (0.8333 quarters); the last at
		// 4.5 s (0.5 s past the change: 0.8333 quarters more) for 0.5 s (0.8333 quarters); all notes off at the clip's
		// end, 12 s: 3 s at 100 bpm after the last off, 5 quarters.
		const midi = text.slice(text.indexOf("<SOURCE MIDI"), text.indexOf("IGNTEMPO"));
		expect(
			midi
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.startsWith("E ")),
		).toEqual([
			"E 0 90 39 72",
			"E 0 90 3c 66",
			"E 1920 80 39 00",
			"E 0 80 3c 00",
			"E 4800 90 48 7f",
			"E 1760 80 48 00",
			"E 0 90 47 4c",
			"E 800 80 47 00",
			"E 4800 b0 7b 00",
		]);
	});

	it("writes a switched-off clip as a muted item, and reads it back off", () => {
		const base = arrangement.clips.find((c) => c.name === "Bass take")!;
		const text = rppProject({
			title: "Off",
			arrangement: { ...arrangement, clips: [{ ...base, muted: true }] },
			audio,
			application: app,
		});
		expect(text).toContain("      MUTE 1 0\n");
		expect(readRpp(text, "Off").arrangement.clips[0]!.muted).toBe(true);
	});

	it("writes a notes clip's expression lanes as controller, bend and pressure events, and reads them back", () => {
		const keys = arrangement.clips.find((c) => c.name === "Chords")!;
		const lanes = [
			{
				kind: "cc" as const,
				controller: 64,
				points: [
					{ t: 0.5, v: 1 },
					{ t: 2, v: 0 },
				],
			},
			{ kind: "bend" as const, points: [{ t: 1, v: 0.75 }] },
			{ kind: "pressure" as const, points: [{ t: 1.5, v: 0.5 }] },
		];
		const text = rppProject({
			title: "Lanes",
			arrangement: { ...arrangement, clips: [{ ...keys, lanes }] },
			audio,
			application: app,
		});
		// The sustain down a beat in (960 ticks at 120 bpm), the bend 3/4 up (12287 of 16383, low 7 bits first) at the next beat, and every lane back to rest at the clip's end.
		expect(text).toContain("E 960 b0 40 7f\n");
		expect(text).toContain("e0 7f 5f\n");
		expect(text).toContain("d0 40\n");
		const back = readRpp(text, "Lanes").arrangement.clips[0]!;
		expect(back.lanes).toEqual([
			{
				kind: "cc",
				controller: 64,
				points: [
					{ t: 0.5, v: 1 },
					{ t: 2, v: 0 },
				],
			},
			{ kind: "bend", points: [{ t: 1, v: 0.75 }] },
			// The pressure rides as 7 bits: 0.5 comes back as 64/127.
			{ kind: "pressure", points: [{ t: 1.5, v: 0.5039 }] },
		]);
	});

	it("writes a tempo ramp over the seconds as a linear point, one over the beats bar by bar, and reads them back", () => {
		const text = rppProject({
			title: "Ramps",
			arrangement: {
				...arrangement,
				bpm: 120,
				beatsPerBar: 4,
				meterChanges: [],
				tempoChanges: [
					{ start: 8, bpm: 60, ramp: "time" },
					{ start: 12, bpm: 90, ramp: "beats" },
				],
			},
			audio,
			application: app,
		});
		// Shape 0 on the point a ramp leaves from (Reaper's tempo is then linear in seconds to the next point).
		// The time signature rides only on the first point (a stamped point starts a measure in Reaper).
		expect(text).toContain(`    PT 0 120 0 ${(4 << 16) | 4} 0 1\n    PT 8 60 0 0 0 0\n`);
		const back = readRpp(text, "Ramps");
		expect(back.fixed).toContain("Tempo ramps kept, linear in seconds");
		const changes = back.arrangement.tempoChanges!;
		expect(changes[0]).toEqual({ start: 8, bpm: 60, ramp: "time" });
		// The ramp over the beats went out bar by bar: more than one point, the last reaching 90 at 12 s.
		expect(changes.length).toBeGreaterThan(2);
		expect(changes.at(-1)!.bpm).toBe(90);
		expect(changes.at(-1)!.start).toBeCloseTo(12, 2);
		expect(changes.slice(1).every((c) => c.ramp === "time")).toBe(true);
	});

	it("writes the mute, send and master envelopes (the mute inverted and square, the send's after its receive), and reads them back", () => {
		const bass = arrangement.tracks.find((t) => t.id === "t-bass")!;
		const mute = [
			{ t: 0, v: 0 },
			{ t: 2, v: 1 },
		];
		const send = [
			{ t: 0, v: 0.5 },
			{ t: 4, v: 1 },
		];
		const masterAutomation = {
			volume: [
				{ t: 0, v: 1 },
				{ t: 4, v: 0.5 },
			],
			mute: [{ t: 1, v: 1 }],
		};
		const text = rppProject({
			title: "Wide",
			arrangement: {
				...arrangement,
				masterAutomation,
				tracks: arrangement.tracks.map((t) =>
					t.id === bass.id ? { ...t, automation: { ...t.automation, mute, "send:b1": send } } : t,
				),
			},
			audio,
			application: app,
		});
		// Reaper's mute envelope: 0 muted, 1 on, each point held (shape 1).
		expect(text).toContain(
			"    <MUTEENV\n      ACT 1 -1\n      VIS 1 1 1\n      ARM 0\n      DEFSHAPE 1 -1 -1\n      PT 0 1 1\n      PT 2 0 1\n    >\n",
		);
		expect(text).toMatch(/AUXRECV \d+ 3 0\.5 [^\n]*\n    <AUXVOLENV\n      ACT 1 -1\n/);
		expect(text).toContain("      PT 4 1 0\n");
		expect(text).toContain(
			"  <MASTERVOLENV\n    ACT 1 -1\n    VIS 1 1 1\n    ARM 0\n    DEFSHAPE 0 -1 -1\n    PT 0 1 0\n    PT 4 0.5 0\n  >\n",
		);
		// Reaper's master has no mute envelope: the master's mute lane stays out.
		expect(text).not.toContain("MASTERMUTEENV");
		const back = readRpp(text, "Wide").arrangement;
		const bassBack = back.tracks.find((t) => t.name === "Bass")!;
		const busBack = back.buses![0]!;
		expect(bassBack.automation?.mute).toEqual(mute);
		expect(bassBack.automation?.[`send:${busBack.id}`]).toEqual(send);
		expect(back.masterAutomation).toEqual({ volume: masterAutomation.volume });
	});

	it("writes a looped clip as a section of its file looped, or as an item per pass when it plays into its loop", () => {
		const base = arrangement.clips.find((c) => c.name === "Bass take")!;
		const inside = { ...base, offset: 1.5, duration: 5, loop: { start: 1, end: 3 } };
		const one = rppProject({
			title: "Loop",
			arrangement: { ...arrangement, clips: [inside] },
			audio,
			application: app,
		});
		expect(one).toContain(
			'      LENGTH 5\n      LOOP 1\n      FADEIN 1 0.5 0 1 0 0 0\n      FADEOUT 1 1 0 1 0 0 0\n      MUTE 0 0\n      NAME "Bass take"\n      VOLPAN 0.7 0 1 -1\n      SOFFS 0.5\n      PLAYRATE 1 1 0 -1 0 0.0025\n      <SOURCE SECTION\n        LENGTH 2\n        STARTPOS 1\n        OVERLAP 0.01\n        <SOURCE WAVE\n          FILE "media/s-bass.wav"\n        >\n      >\n',
		);
		const back = readRpp(one, "Loop").arrangement.clips[0]!;
		expect([back.start, back.offset, back.duration, back.loop]).toEqual([
			1.25,
			1.5,
			5,
			{ start: 1, end: 3 },
		]);
		const before = { ...base, offset: 0, duration: 5, loop: { start: 1, end: 3 } };
		const many = rppProject({
			title: "Loop",
			arrangement: { ...arrangement, clips: [before] },
			audio,
			application: app,
		});
		const items = many.split("<ITEM").slice(1);
		expect(items).toHaveLength(2);
		expect(items[0]).toContain("POSITION 1.25\n      LENGTH 3\n      FADEIN 1 0.5 ");
		expect(items[0]).toContain("FADEOUT 1 0 ");
		expect(items[1]).toContain("POSITION 4.25\n      LENGTH 2\n      FADEIN 1 0 ");
		expect(items[1]).toContain("FADEOUT 1 1 ");
		expect(items[1]).toContain("SOFFS 1\n");
	});

	it("round-trips through the reader: the same tracks, buses, routing, clips, notes, tempo map and markers", () => {
		const read = readRpp(text, "Exiles");
		const b = read.arrangement;
		expect(read.notes).toBe("Title: Exiles\nKey: A minor\nKey from 8 s: C major");
		expect(b.bpm).toBe(120);
		expect(b.sampleRate).toBe(48000);
		expect(b.master).toBe(0.9);
		expect(b.tempoChanges).toEqual([{ start: 8, bpm: 100 }]);
		expect(b.meterChanges).toEqual([{ start: 8, beatsPerBar: 3 }]);
		expect(b.markers?.map((m) => [m.t, m.name])).toEqual([
			[0, "Intro"],
			[8, "Verse"],
		]);
		expect(b.buses?.map((x) => [x.name, x.colour, x.gain])).toEqual([["Drums", "sea", 0.8]]);
		expect(
			b.tracks.map((t) => [
				t.name,
				t.kind ?? "audio",
				t.gain,
				t.pan,
				t.muted,
				t.solo,
				t.colour,
				t.output === b.buses?.[0]?.id,
			]),
		).toEqual([
			["Bass", "audio", 0.8, -0.3, false, false, undefined, false],
			["Keys", "midi", 1, 0, false, false, undefined, false],
			["Kick", "audio", 1, 0, false, true, "clay", true],
			["Hats", "audio", 1, 0.2, true, false, undefined, true],
		]);
		expect(b.tracks[0]!.sends).toEqual([{ bus: b.buses![0]!.id, level: 0.5, pre: true }]);
		expect(b.tracks[0]!.automation).toEqual({
			volume: [
				{ t: 0, v: 1 },
				{ t: 4, v: 0.5 },
			],
			pan: [{ t: 0, v: -0.3 }],
		});
		expect(
			b.clips
				.filter((c) => c.sourceId)
				.map((c) => [c.name, c.start, c.offset, c.duration, c.gain, c.fadeIn, c.fadeOut]),
		).toEqual([
			["Bass take", 1.25, 0.5, 4, 0.7, 0.5, 1],
			["Kick take", 0, 0, 8, 1, 0, 0],
		]);
		expect(read.files.map((f) => f.path)).toEqual(["media/s-bass.wav", "media/s-kick.wav"]);
		const midi = b.clips.find((c) => c.notes)!;
		expect([midi.start, midi.duration]).toEqual([4, 8]);
		expect(midi.notes!.map((n) => [n.t, n.d, n.p, n.v])).toEqual([
			[0, 1, 57, 0.8976],
			[0, 1, 60, 0.8031],
			[3.5, 1, 72, 1],
			[4.5, 0.5, 71, 0.5984],
		]);
		expect(read.dropped).toEqual([]);
		expect(read.fixed).toEqual(["Track colors read as the nearest of Dawn's tints"]);
	});
});

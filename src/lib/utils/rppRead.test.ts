import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { rppProject } from "./rpp";
import { readRpp } from "./rppRead";

const corpus = readFileSync("tests/rpp/reaper-7.82.RPP", "utf8");

describe("readRpp", () => {
	it("reads the project Reaper 7.82 saved from Dawn's bundle: tracks, clips in seconds, the tempo map, markers, the MIDI part", () => {
		const read = readRpp(corpus, "reaper");
		const a = read.arrangement;
		expect(read.title).toBe("reaper");
		expect(a.bpm).toBe(120);
		expect(a.beatsPerBar).toBe(4);
		expect(a.sampleRate).toBe(44100);
		expect(a.tempoChanges).toEqual([{ start: 8, bpm: 100 }]);
		expect(a.meterChanges).toEqual([{ start: 8, beatsPerBar: 3 }]);
		expect(a.markers?.map((m) => [m.t, m.name])).toEqual([
			[0, "Intro"],
			[8, "Verse"],
			[12.5, "Bridge"],
		]);
		expect(a.tracks.map((t) => t.name)).toEqual([
			"01 Kick - Kick take @ 0.000s",
			"02 Hats - Hats take @ 2.000s",
			"03 Bass - Bass take @ 1.250s",
			"04 Keys - Keys take @ 2.500s",
			"Interop song",
		]);
		expect(a.tracks.map((t) => t.kind ?? "audio")).toEqual([
			"audio",
			"audio",
			"audio",
			"audio",
			"midi",
		]);
		expect(a.buses).toBeUndefined();
		const audio = a.clips.filter((c) => c.sourceId);
		expect(audio.map((c) => [c.start, c.duration, c.offset])).toEqual([
			[0, 17.6, 0],
			[2, 10.8, 0],
			[1.25, 13.05, 0],
			[2.5, 9.7, 0],
		]);
		expect(read.files.map((f) => f.path)).toEqual([
			"clips/01 Kick - Kick take @ 0.000s.wav",
			"clips/02 Hats - Hats take @ 2.000s.wav",
			"clips/03 Bass - Bass take @ 1.250s.wav",
			"clips/04 Keys - Keys take @ 2.500s.wav",
		]);
		expect(read.files[0]!.label).toBe(
			"01 Kick - Kick take @ 0.000s - 01 Kick - Kick take @ 0.000s.wav",
		);
		// The MIDI item from zero, 12.8 s long; its notes through the tempo map: the chords at 4 s and 6 s, the
		// high notes at 8 s and 8.5 s (480 and 400 ticks at 100 bpm after the change).
		const midi = a.clips.find((c) => c.notes)!;
		expect([midi.start, midi.duration]).toEqual([0, 12.8]);
		expect(midi.notes!.map((n) => [n.t, n.d, n.p])).toEqual([
			[4, 1, 57],
			[4, 1, 60],
			[4, 1, 64],
			[6, 1, 55],
			[6, 1, 59],
			[6, 1, 62],
			[8, 0.5, 72],
			[8.5, 0.5, 71],
		]);
		expect(midi.notes![0]!.v).toBe(0.8976);
		expect(midi.notes![6]!.v).toBe(1);
		// Reaper's import stretched the clips (its own doing in that run) by play rates under one: each comes across as a warp of
		// one ratio, the kick's 1/0.90909 = 1.1 (docs/multitrack-recorder.md "Warping a clip").
		expect(read.dropped).toEqual([]);
		expect(read.fixed).toEqual(["Play rates kept as warps, pitch kept (Dawn's own stretch)"]);
		expect(audio[0]!.warp).toEqual([
			{ at: 0, source: 0 },
			{ at: 1.1, source: 1 },
		]);
		expect(audio.every((c) => c.warp?.length === 2)).toBe(true);
	});

	it("reads folders as buses, receives as sends, envelopes as lanes, colors, fades, offsets, other takes, regions, notes", () => {
		const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  <NOTES 0 2
    |A song
    |in two lines
  >
  SAMPLERATE 48000 0 0
  TEMPO 90 6 8 0
  MARKER 1 1.5 "Verse one" 0 0 1
  MARKER 2 4 Chorus 1 0 1
  MARKER 2 6 "" 1
  MASTER_VOLUME 0.5 0 -1 -1 1
  <TRACK
    NAME Drums
    PEAKCOL 29806207
    VOLPAN 0.8 0 -1 -1 1
    MUTESOLO 0 0 0
    ISBUS 1 1
    AUXRECV 2 3 0.25 0 0 0 0 0 0 -1 0 -1 0
    <VOLENV2
      ACT 1 -1
      PT 0 1 0
      PT 2 0.5 0
    >
  >
  <TRACK
    NAME Kick
    VOLPAN 1 -0.3 -1 -1 1
    MUTESOLO 1 1 0
    ISBUS 2 -1
    <PANENV2
      ACT 1 -1
      PT 0 1 0
      PT 1 -0.5 1
    >
    <ITEM
      POSITION 1
      LENGTH 2
      FADEIN 1 0.1 0 1 0 0 0
      FADEOUT 3 0.25 0 1 0 0 0
      MUTE 0 0
      NAME "First take"
      VOLPAN 0.9 0 1 -1
      SOFFS 0.5
      PLAYRATE 1 1 0 -1 0 0.0025
      <SOURCE WAVE
        FILE "/home/me/Media/kick.wav"
      >
      TAKE SEL
      NAME "Second take"
      VOLPAN 1 0 1 -1
      SOFFS 0
      PLAYRATE 1 1 0 -1 0 0.0025
      <SOURCE SECTION
        STARTPOS 0.25
        LENGTH 2
        <SOURCE FLAC
          FILE "Media/kick-2.flac"
        >
      >
    >
    <ITEM
      POSITION 5
      LENGTH 1
      MUTE 1 0
      NAME Muted
      <SOURCE WAVE
        FILE "Media/kick.wav"
      >
    >
  >
  <TRACK
    NAME Bass
    VOLPAN 1 0 -1 -1 1
    MUTESOLO 0 0 0
    ISBUS 0 0
    MAINSEND 0 0
    <ITEM
      POSITION 0
      LENGTH 4
      NAME Bass
      <SOURCE WAVE
        FILE "/home/me/Media/kick.wav"
      >
    >
  >
>`;
		const read = readRpp(rpp, "test");
		const a = read.arrangement;
		expect(read.notes).toBe("A song\nin two lines");
		expect(a.bpm).toBe(90);
		expect(a.beatsPerBar).toBe(6);
		expect(a.beatUnit).toBe(8);
		expect(a.master).toBe(0.5);
		expect(a.sampleRate).toBe(48000);
		// The region is a section marker at its start.
		expect(a.markers?.map((m) => [m.t, m.name, m.section])).toEqual([
			[1.5, "Verse one", undefined],
			[4, "Chorus", true],
		]);
		// Reaper's own color, kept as it is (near Dawn's sea, not it).
		expect(a.buses?.map((b) => [b.name, b.gain, b.colour])).toEqual([["Drums", 0.8, "#7fcec6"]]);
		expect(a.buses![0]!.automation).toEqual({
			volume: [
				{ t: 0, v: 1 },
				{ t: 2, v: 0.5 },
			],
		});
		expect(a.tracks.map((t) => [t.name, t.pan, t.muted, t.solo])).toEqual([
			["Kick", -0.3, true, true],
			["Bass", 0, false, false],
		]);
		// The child of the folder goes to it; the bus's receive from track 2 (Bass) is a pre-fader send.
		expect(a.tracks[0]!.output).toBe(a.buses![0]!.id);
		expect(a.tracks[1]!.output).toBeUndefined();
		expect(a.tracks[1]!.sends).toEqual([{ bus: a.buses![0]!.id, level: 0.25, pre: true }]);
		// The pan envelope the other way up: +1 in the file is hard left.
		expect(a.tracks[0]!.automation).toEqual({
			pan: [
				{ t: 0, v: -1 },
				{ t: 1, v: 0.5 },
			],
		});
		// The selected take wins; its section start adds to the offset; the muted item comes across switched off; a file is one source.
		expect(
			a.clips.map((c) => [
				c.name,
				c.start,
				c.duration,
				c.offset,
				c.gain,
				c.fadeIn,
				c.fadeOut,
				c.fadeShape,
				c.muted,
			]),
		).toEqual([
			["Second take", 1, 2, 0.25, 1, 0.1, 0.25, "power", undefined],
			["Muted", 5, 1, 0, 1, 0, 0, undefined, true],
			["Bass", 0, 4, 0, 1, 0, 0, undefined, undefined],
		]);
		expect(read.files.map((f) => f.path)).toEqual([
			"Media/kick-2.flac",
			"/home/me/Media/kick.wav",
			"Media/kick.wav",
		]);
		// The item's first take stays behind the chosen one as a take of the clip, its file brought along.
		expect(a.clips[0]!.alternates).toEqual([read.files[1]!.sourceId]);
		expect(read.files[1]!.label).toBe("Kick - First take");
		expect(read.dropped).toEqual([]);
		expect(read.fixed).toEqual([
			"Envelope shapes other than linear read as linear",
			"Bass sends to no output in Reaper: goes to the master here",
			"Fade shapes other than linear read as equal power",
			"Second take on Kick: 1 other take kept behind it as takes",
			"A take behind a clip plays from the clip's own offset",
		]);
	});

	it("keeps a folder inside a folder: groups in groups, each track to its own folder", () => {
		const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  TEMPO 120 4 4 0
  <TRACK
    NAME Drums
    ISBUS 1 1
  >
  <TRACK
    NAME Kit
    ISBUS 1 1
    <ITEM
      POSITION 0
      LENGTH 2
      NAME Overheads
      <SOURCE WAVE
        FILE "Media/oh.wav"
      >
    >
  >
  <TRACK
    NAME Kick
    ISBUS 2 -1
  >
  <TRACK
    NAME Room
    ISBUS 2 -1
  >
  <TRACK
    NAME Bass
    ISBUS 0 0
  >
>`;
		const read = readRpp(rpp, "nested");
		const a = read.arrangement;
		const bus = (name: string) => a.buses!.find((b) => b.name === name)!;
		const track = (name: string) => a.tracks.find((t) => t.name === name)!;
		expect(a.buses!.map((b) => [b.name, !!b.folder])).toEqual([
			["Drums", true],
			["Kit", true],
		]);
		expect(bus("Drums").output).toBeUndefined();
		expect(bus("Kit").output).toBe(bus("Drums").id);
		expect(track("Kick").output).toBe(bus("Kit").id);
		expect(track("Room").output).toBe(bus("Drums").id);
		expect(track("Bass").output).toBeUndefined();
		// The folder's own item lands on a track named after it, inside it.
		expect(a.tracks.map((t) => t.name)).toEqual(["Kit", "Kick", "Room", "Bass"]);
		expect(track("Kit").output).toBe(bus("Kit").id);
		expect(a.clips.map((c) => [c.name, c.trackId, c.duration])).toEqual([
			["Overheads", track("Kit").id, 2],
		]);
		expect(read.fixed).toContain("Items on the folder Kit: on a track of their own inside it");
	});

	it("keeps an item that loops a section of its file as a looped clip", () => {
		const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  TEMPO 120 4 4 0
  <TRACK
    NAME Kick
    <ITEM
      POSITION 1
      LENGTH 5
      LOOP 1
      NAME Looped
      SOFFS 0.5
      <SOURCE SECTION
        STARTPOS 1
        LENGTH 2
        <SOURCE WAVE
          FILE "Media/kick.wav"
        >
      >
    >
    <ITEM
      POSITION 8
      LENGTH 1.5
      LOOP 1
      NAME Once
      SOFFS 0
      <SOURCE SECTION
        STARTPOS 1
        LENGTH 2
        <SOURCE WAVE
          FILE "Media/kick.wav"
        >
      >
    >
  >
>`;
		const clips = readRpp(rpp, "loop").arrangement.clips;
		expect(clips.map((c) => [c.name, c.start, c.offset, c.duration, c.loop])).toEqual([
			["Looped", 1, 1.5, 5, { start: 1, end: 3 }],
			["Once", 8, 1, 1.5, undefined],
		]);
	});

	it("reads a take's active volume envelope as the clip's gain envelope in content seconds, through the play rate", () => {
		const item = (name: string, env: string) => `    <ITEM
      POSITION 2
      LENGTH 4
      NAME ${name}
      SOFFS 1
      PLAYRATE 0.5 1 0 -1 0 0.0025
      <SOURCE WAVE
        FILE "Media/keys.wav"
      >
${env}
    >`;
		const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  TEMPO 120 4 4 0
  <TRACK
    NAME Keys
${item("Ride", "      <VOLENV\n        ACT 1 -1\n        PT 0 1 0\n        PT 0.5 0.5 2\n        PT 1.5 2.5 0\n      >")}
${item("Off", "      <VOLENV\n        ACT 0 -1\n        PT 0 0.5 0\n      >")}
${item("Flat", "      <VOLENV\n        ACT 1 -1\n        PT 0 1 0\n      >")}
${item("Empty", "      <VOLENV\n        ACT 1 -1\n      >")}
  >
>`;
		const read = readRpp(rpp, "ride");
		const [ride, off, flat, empty] = read.arrangement.clips;
		// Half speed: the file's 1 s is content 2 s; take time over the rate is seconds of the item; the value clamped to 2.
		expect(ride!.offset).toBe(2);
		expect(ride!.gainEnvelope).toEqual([
			{ t: 2, v: 1 },
			{ t: 3, v: 0.5 },
			{ t: 5, v: 2 },
		]);
		expect(read.fixed).toContain("Envelope shapes other than linear read as linear");
		expect(off!.gainEnvelope).toBeUndefined();
		expect(flat!.gainEnvelope).toBeUndefined();
		expect(empty!.gainEnvelope).toBeUndefined();
	});

	it("round-trips a gain envelope through the writer and back", () => {
		const gainEnvelope = [
			{ t: 1, v: 0.5 },
			{ t: 1.7321, v: 1.2 },
			{ t: 3.25, v: 0 },
			{ t: 5, v: 0.8 },
		];
		const arrangement: StudioArrangement = {
			version: 1,
			bpm: 120,
			beatsPerBar: 4,
			gridOn: true,
			countIn: false,
			click: false,
			loop: null,
			master: 1,
			tracks: [
				{
					id: "t",
					name: "Keys",
					gain: 1,
					pan: 0,
					muted: false,
					solo: false,
					armed: false,
					input: null,
				},
			],
			clips: [
				{
					id: "c",
					trackId: "t",
					sourceId: "s",
					start: 2,
					offset: 1,
					duration: 4,
					gain: 1,
					fadeIn: 0,
					fadeOut: 0,
					name: "Ride",
					warp: [
						{ at: 0, source: 0 },
						{ at: 1.25, source: 1 },
					],
					gainEnvelope,
				},
			],
		};
		const text = rppProject({
			title: "Ride",
			arrangement,
			audio: new Map([
				["s", { path: "media/s.wav", durationSeconds: 20, sampleRate: 48000, channels: 2 }],
			]),
			application: { name: "test", version: "1" },
		});
		const back = readRpp(text).arrangement.clips[0]!.gainEnvelope!;
		expect(back).toHaveLength(gainEnvelope.length);
		back.forEach((p, i) => {
			expect(p.t).toBeCloseTo(gainEnvelope[i]!.t, 4);
			expect(p.v).toBeCloseTo(gainEnvelope[i]!.v, 4);
		});
	});

	it("takes a MIDI take at its own tempo when it ignores the project's, and refuses what is not a project", () => {
		const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  TEMPO 120 4 4 0
  <TRACK
    NAME Keys
    <ITEM
      POSITION 2
      LENGTH 4
      NAME Part
      SOFFS 0 0
      <SOURCE MIDI
        HASDATA 1 480 QN
        IGNTEMPO 1 60 4 4
        E 480 90 3c 40
        E 240 80 3c 00
        Em 0 90 40 7f
        E 480 90 40 7f
        E 0 b0 7b 00
      >
    >
  >
>`;
		const read = readRpp(rpp, "midi");
		const clip = read.arrangement.clips[0]!;
		expect(read.arrangement.tracks[0]!.kind).toBe("midi");
		// 480 ticks at 480 PPQ at the take's 60 bpm: one second in; the muted event skipped; the open note closed at the clip's end.
		expect(clip.notes).toEqual([
			{ t: 1, d: 0.5, p: 60, v: 0.5039 },
			{ t: 2.5, d: 1.5, p: 64, v: 1 },
		]);
		expect(() => readRpp("<Project/>")).toThrow(/Not a Reaper project/);
	});
});

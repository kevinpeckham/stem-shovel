import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
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
		expect(a.master).toBe(0.5);
		expect(a.sampleRate).toBe(48000);
		expect(a.markers?.map((m) => [m.t, m.name])).toEqual([
			[1.5, "Verse one"],
			[4, "Chorus"],
		]);
		expect(a.buses?.map((b) => [b.name, b.gain, b.colour])).toEqual([["Drums", 0.8, "sea"]]);
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
			"Media/kick.wav",
			"/home/me/Media/kick.wav",
		]);
		expect(read.dropped).toEqual(["Second take on Kick: 1 other take"]);
		expect(read.fixed).toEqual([
			"Time signature 6/8 at the start read as 6/4",
			"Regions read as markers at their start",
			"Track colors read as the nearest of Dawn's tints",
			"Envelope shapes other than linear read as linear",
			"Bass sends to no output in Reaper: goes to the master here",
			"Fade shapes other than linear read as equal power",
		]);
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

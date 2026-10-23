// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { dawproject } from "./dawproject";
import { readDawproject } from "./dawprojectRead";

const arrangement: StudioArrangement = {
	version: 1,
	bpm: 124,
	beatsPerBar: 3,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 0.9,
	buses: [{ id: "b1", name: "Drums & FX", gain: 0.8, pan: 0.2, muted: false, colour: "sea" }],
	tracks: [
		{
			id: "t1",
			name: 'Guitar "lead" <solo>',
			mono: true,
			gain: 0.7,
			pan: -0.5,
			muted: false,
			solo: true,
			armed: false,
			input: null,
			colour: "rose",
			sends: [{ bus: "b1", level: 0.4 }],
			automation: {
				volume: [
					{ t: 0, v: 0.2 },
					{ t: 4, v: 1 },
				],
				pan: [{ t: 1, v: -1 }],
			},
		},
		{
			id: "t2",
			name: "Keys",
			kind: "midi",
			gain: 1,
			pan: 0,
			muted: true,
			solo: false,
			armed: false,
			input: { source: "piano", channel: "stereo" },
			output: "b1",
		},
	],
	clips: [
		{
			id: "c1",
			trackId: "t1",
			sourceId: "s1",
			start: 2,
			offset: 0.5,
			duration: 10,
			gain: 1,
			fadeIn: 0.1,
			fadeOut: 0.25,
			name: "Take 1",
		},
		{
			id: "c3",
			trackId: "t2",
			notes: [
				{ t: 0, d: 0.5, p: 60, v: 0.8 },
				{ t: 1, d: 0.5, p: 64, v: 1 },
			],
			start: 4,
			offset: 0,
			duration: 2,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Chords",
		},
	],
};

describe("readDawproject", () => {
	it("reads back what the writer wrote: the round trip up to ids", () => {
		const written = dawproject({
			title: "Round trip",
			arrangement,
			audio: new Map([
				["s1", { path: "audio/s1.wav", durationSeconds: 30, sampleRate: 48000, channels: 2 }],
			]),
			application: { name: "Stem Shovel Dawn", version: "0.141.0" },
		});
		const read = readDawproject(written.project, written.metadata);
		expect(read.title).toBe("Round trip");
		expect(read.notes).toContain("Imported from Stem Shovel Dawn 0.141.0");
		const a = read.arrangement;
		expect([a.bpm, a.beatsPerBar, a.master]).toEqual([124, 3, 0.9]);
		expect(a.buses?.map((b) => [b.name, b.gain, b.pan, b.muted, b.colour])).toEqual([
			["Drums & FX", 0.8, 0.2, false, "sea"],
		]);
		// The mono guitar comes back mono (audioChannels="1"); the rest stereo.
		expect(a.tracks.map((t) => t.mono)).toEqual([true, undefined]);
		expect(a.tracks.map((t) => [t.name, t.kind, t.gain, t.pan, t.muted, t.solo, t.colour])).toEqual(
			[
				['Guitar "lead" <solo>', "audio", 0.7, -0.5, false, true, "rose"],
				["Keys", "midi", 1, 0, true, false, undefined],
			],
		);
		// Routing and sends name the bus by its new id.
		expect(a.tracks[1]!.output).toBe(a.buses![0]!.id);
		expect(a.tracks[1]!.input).toEqual({ source: "piano", channel: "stereo" });
		expect(a.tracks[0]!.sends).toEqual([{ bus: a.buses![0]!.id, level: 0.4 }]);
		expect(a.tracks[0]!.automation).toEqual({
			volume: [
				{ t: 0, v: 0.2 },
				{ t: 4, v: 1 },
			],
			pan: [{ t: 1, v: -1 }],
		});
		// The audio clip over its file, the notes clip with its notes; the source minted once for the file.
		expect(read.files).toEqual([
			{ sourceId: expect.any(String), path: "audio/s1.wav", label: "Take 1", sampleRate: 48000 },
		]);
		expect(
			a.clips.map((c) => [c.trackId, c.start, c.offset, c.duration, c.fadeIn, c.fadeOut, c.name]),
		).toEqual([
			[a.tracks[0]!.id, 2, 0.5, 10, 0.1, 0.25, "Take 1"],
			[a.tracks[1]!.id, 4, 0, 2, 0, 0, "Chords"],
		]);
		expect(a.clips[0]!.sourceId).toBe(read.files[0]!.sourceId);
		expect(a.clips[1]!.notes).toEqual([
			{ t: 0, d: 0.5, p: 60, v: 0.8 },
			{ t: 1, d: 0.5, p: 64, v: 1 },
		]);
		expect(read.dropped).toEqual([]);
	});

	it("reads another DAW's dialect: beats, a group as a bus, devices and stretch reported, tempo automation, markers", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Application name="Bitwig Studio" version="5.3"/>
  <Transport>
    <Tempo unit="bpm" value="120" id="tempo"/>
    <TimeSignature numerator="4" denominator="4" id="sig"/>
  </Transport>
  <Structure>
    <Track contentType="audio" loaded="true" id="group" name="Band" color="#7fb2c2">
      <Channel audioChannels="2" role="regular" solo="false" destination="masterch" id="groupch">
        <Volume unit="decibel" value="-6" id="gvol"/>
        <Pan unit="normalized" value="0.5" id="gpan"/>
        <Mute value="false" id="gmute"/>
        <Devices><Device deviceName="Pro-Q 3" deviceRole="audioFX" id="d1"/></Devices>
      </Channel>
      <Track contentType="audio" loaded="true" id="drums" name="Drums">
        <Channel audioChannels="2" role="regular" solo="true" destination="groupch" id="drumsch">
          <Volume unit="linear" value="1.2" id="dvol"/>
          <Pan unit="normalized" value="0.25" id="dpan"/>
          <Mute value="false" id="dmute"/>
          <Sends><Send destination="fxch" type="pre" id="send1"><Volume unit="linear" value="0.3" id="sv"/></Send></Sends>
        </Channel>
      </Track>
    </Track>
    <Track contentType="notes" loaded="true" id="synth" name="Synth">
      <Channel audioChannels="2" role="regular" solo="false" destination="masterch" id="synthch">
        <Volume unit="linear" value="0.9" id="svol"/><Pan unit="normalized" value="0.5" id="span"/><Mute value="false" id="smute"/>
        <Devices><Vst3Plugin deviceName="Serum" deviceRole="instrument" id="d2"/></Devices>
      </Channel>
    </Track>
    <Track contentType="audio" loaded="true" id="fx" name="Reverb">
      <Channel audioChannels="2" role="effect" solo="false" destination="masterch" id="fxch">
        <Volume unit="linear" value="1" id="fvol"/><Pan unit="normalized" value="0.5" id="fpan"/><Mute value="false" id="fmute"/>
      </Channel>
    </Track>
    <Track contentType="audio notes" loaded="true" id="master" name="Master">
      <Channel audioChannels="2" role="master" solo="false" id="masterch">
        <Volume unit="linear" value="0.8" id="mvol"/><Pan unit="normalized" value="0.5" id="mpan"/><Mute value="false" id="mmute"/>
      </Channel>
    </Track>
  </Structure>
  <Arrangement id="arr">
    <TempoAutomation unit="bpm" id="ta"><Target parameter="tempo"/><RealPoint time="0" value="120" interpolation="hold"/><RealPoint time="8" value="60" interpolation="hold"/></TempoAutomation>
    <TimeSignatureAutomation id="tsa"><TimeSignaturePoint time="8" numerator="3" denominator="4"/></TimeSignatureAutomation>
    <Markers id="mk"><Marker time="4" name="Verse"/></Markers>
    <Lanes timeUnit="beats" id="lanes">
      <Lanes track="drums" id="l1">
        <Clips id="cl1">
          <Clip time="4" duration="8" contentTimeUnit="beats" playStart="2" fadeTimeUnit="seconds" fadeInTime="0.5" name="Loop">
            <Warps contentTimeUnit="seconds" id="w">
              <Audio algorithm="stretch" channels="2" duration="20" sampleRate="44100" id="au"><File path="audio/loop.flac"/></Audio>
              <Warp time="0" contentTime="1"/>
              <Warp time="8" contentTime="3"/>
            </Warps>
          </Clip>
          <Clip time="12" contentTimeUnit="beats" name="Plain">
            <Audio algorithm="raw" channels="1" duration="5" sampleRate="48000" id="au2"><File path="audio/loop.flac"/></Audio>
          </Clip>
        </Clips>
        <Points unit="linear" id="pts"><Target parameter="dvol"/><RealPoint time="0" value="1"/><RealPoint time="4" value="0.5"/></Points>
        <Points unit="linear" id="pts2"><Target parameter="d1param"/><RealPoint time="0" value="1"/></Points>
      </Lanes>
      <Lanes track="synth" id="l2">
        <Clips id="cl2">
          <Clip time="0" duration="4" contentTimeUnit="beats" playStart="0" name="Riff">
            <Notes id="n"><Note time="0" duration="1" channel="0" key="60" vel="0.5"/><Note time="2" duration="0.5" channel="0" key="67" vel="1"/></Notes>
          </Clip>
        </Clips>
      </Lanes>
    </Lanes>
  </Arrangement>
  <Scenes id="sc"/>
</Project>`;
		const read = readDawproject(
			xml,
			"<MetaData><Title>Night Drive</Title><Artist>Bad Verbs</Artist><Songwriter>K. Peckham</Songwriter><Year>2026</Year><Comment>demo</Comment></MetaData>",
		);
		const a = read.arrangement;
		expect(read.title).toBe("Night Drive");
		expect(read.notes).toBe(
			"Artist: Bad Verbs\nSongwriter: K. Peckham\nYear: 2026\ndemo\nImported from Bitwig Studio 5.3.",
		);
		expect(read.metadata).toEqual({
			artist: "Bad Verbs",
			songwriter: "K. Peckham",
			year: "2026",
			comment: "demo",
		});
		// 120 bpm until beat 8 (4 s), then 60: beat 12 is at 8 s.
		expect([a.bpm, a.beatsPerBar, a.master]).toEqual([120, 4, 0.8]);
		expect(a.tempoChanges).toEqual([{ start: 4, bpm: 60 }]);
		expect(a.meterChanges).toEqual([{ start: 4, beatsPerBar: 3 }]);
		expect(a.markers?.map((m) => [m.t, m.name])).toEqual([[2, "Verse"]]);
		// The group is a bus (-6 dB ≈ 0.5012), the effect track another; the drums route to the group and send to the reverb pre-fader.
		expect(a.buses?.map((b) => [b.name, Math.round(b.gain * 1000) / 1000, b.colour])).toEqual([
			["Band", 0.501, "sea"],
			["Reverb", 1, undefined],
		]);
		expect(a.tracks.map((t) => [t.name, t.kind, t.gain, t.pan, t.solo])).toEqual([
			["Drums", "audio", 1.2, -0.5, true],
			["Synth", "midi", 0.9, 0, false],
		]);
		expect(a.tracks[0]!.output).toBe(a.buses![0]!.id);
		expect(a.tracks[0]!.sends).toEqual([{ bus: a.buses![1]!.id, level: 0.3, pre: true }]);
		// Beats to seconds: the clip at beat 4 is 2 s in, 8 beats long is 4 s; the fade stays in seconds.
		const loop = a.clips.find((c) => c.name === "Loop")!;
		expect([loop.start, loop.duration, loop.fadeIn]).toEqual([2, 4, 0.5]);
		// The warps stretch 2 s of file (1 s to 3 s) over 4 s of clip: kept as the clip's warp, the playStart of 2 beats a second
		// into that warped content (docs/multitrack-recorder.md "Warping a clip").
		expect(loop.offset).toBe(1);
		expect(loop.warp).toEqual([
			{ at: 0, source: 1 },
			{ at: 4, source: 3 },
		]);
		expect(read.fixed).toContain("Warped audio kept, stretched by Dawn's own algorithm");
		// A clip with no duration runs to the file's end from its offset; the same file is one source.
		const plain = a.clips.find((c) => c.name === "Plain")!;
		expect([plain.start, plain.offset, plain.duration]).toEqual([8, 0, 5]);
		expect(read.files).toHaveLength(1);
		expect(plain.sourceId).toBe(loop.sourceId);
		// The notes in beats to seconds; the volume automation on the drums, in seconds.
		const riff = a.clips.find((c) => c.name === "Riff")!;
		expect(riff.notes).toEqual([
			{ t: 0, d: 0.5, p: 60, v: 0.5 },
			{ t: 1, d: 0.25, p: 67, v: 1 },
		]);
		expect(a.tracks[0]!.automation).toEqual({
			volume: [
				{ t: 0, v: 1 },
				{ t: 2, v: 0.5 },
			],
		});
		expect(read.dropped).toEqual([
			"Pro-Q 3 on Band",
			"Serum on Synth",
			"automation of d1param",
			"clip launcher scenes",
		]);
	});

	it("reads a Bitwig 5.3 export's ways: an empty title, float-noise tempo, a switched-off send and clip, MIDI controller lanes", () => {
		// Trimmed from a real export (Canon in D, Bitwig Studio 5.3.13, github.com/gmlewis/canon-in-d).
		const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project version="1.0">
    <Application name="Bitwig Studio" version="5.3.13"/>
    <Transport>
        <Tempo max="666.000000" min="20.000000" unit="bpm" value="100.000167" id="id0" name="Tempo"/>
        <TimeSignature denominator="4" numerator="4" id="id1"/>
    </Transport>
    <Structure>
        <Track contentType="notes" loaded="true" id="id2" name="Piano" color="#ff5706">
            <Channel audioChannels="2" destination="id22" role="regular" solo="false" id="id3">
                <Devices><Vst3Plugin deviceName="TripleCheese" deviceRole="instrument" loaded="true" id="id5" name="TripleCheese"><Parameters/><Enabled value="true" id="id8" name="On/Off"/><State path="plugins/9ff.vstpreset"/></Vst3Plugin></Devices>
                <Mute value="false" id="id9" name="Mute"/>
                <Pan max="1.000000" min="0.000000" unit="normalized" value="0.500000" id="id10" name="Pan"/>
                <Sends>
                    <Send destination="id17" type="post" id="id26"><Volume max="2.000000" min="0.000000" unit="linear" value="0.5" id="id27" name="Send level"/></Send>
                    <Send destination="id17" type="post" id="id28"><Enable value="false" id="id30"/><Volume max="2.000000" min="0.000000" unit="linear" value="1.0" id="id29"/></Send>
                </Sends>
                <Volume max="2.000000" min="0.000000" unit="linear" value="1.250000" id="id11" name="Volume"/>
            </Channel>
        </Track>
        <Track contentType="audio" loaded="true" id="id16" name="FX">
            <Channel audioChannels="2" destination="id22" role="effect" solo="false" id="id17">
                <Mute value="false" id="id18"/><Pan unit="normalized" value="0.5" id="id19"/><Volume unit="linear" value="1.0" id="id20"/>
            </Channel>
        </Track>
        <Track contentType="audio notes" loaded="true" id="id21" name="Master">
            <Channel audioChannels="2" role="master" solo="false" id="id22">
                <Mute value="false" id="id23"/><Pan unit="normalized" value="0.5" id="id24"/><Volume unit="linear" value="1.0" id="id25"/>
            </Channel>
        </Track>
    </Structure>
    <Arrangement id="id34">
        <Lanes timeUnit="beats" id="id35">
            <Lanes track="id2" id="id36">
                <Clips id="id37">
                    <Clip time="0.0" duration="8.0" playStart="0.0" loopStart="0.0" loopEnd="8.0" enable="true" name="Piano">
                        <Notes id="id38"><Note time="0.000000" duration="1.000000" channel="0" key="62" vel="0.800000" rel="0.500000"/></Notes>
                        <Points unit="normalized" id="id39"><Target expression="channelController" channel="0" controller="7"/><RealPoint value="0.787402" interpolation="linear" time="0.000000"/></Points>
                    </Clip>
                    <Clip time="8.0" duration="4.0" playStart="0.0" enable="false" name="Muted">
                        <Notes id="id40"><Note time="0.000000" duration="1.000000" channel="0" key="60" vel="0.8" rel="0.5"/></Notes>
                    </Clip>
                </Clips>
            </Lanes>
        </Lanes>
        <TempoAutomation unit="bpm" id="id54"><Target parameter="id0"/><RealPoint value="100.000167" interpolation="linear" time="0.000000"/><RealPoint value="100.000167" interpolation="linear" time="400.000000"/><RealPoint value="50.000083" interpolation="linear" time="400.000000"/></TempoAutomation>
    </Arrangement>
    <Scenes id="id55"><Scene name="Scene 1" id="id56"><Lanes id="id57"/></Scene></Scenes>
</Project>`;
		const meta = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<MetaData><Title></Title><Artist></Artist><Album></Album><Comment></Comment></MetaData>`;
		const read = readDawproject(xml, meta, "CanonInD");
		expect(read.title).toBe("CanonInD");
		expect(read.notes).toBe("Imported from Bitwig Studio 5.3.13.");
		const a = read.arrangement;
		expect(a.bpm).toBe(100);
		// Two points on beat 400 (a jump written as a ramp of no length) are one step: the ruler keys its flags by time.
		expect(a.tempoChanges).toEqual([{ start: 240, bpm: 50 }]);
		expect(a.tracks.map((t) => [t.name, t.kind, t.gain])).toEqual([["Piano", "midi", 1.25]]);
		expect(a.buses?.map((b) => b.name)).toEqual(["FX"]);
		// The switched-off send is no send; the live one goes to the effect track.
		expect(a.tracks[0]!.sends).toEqual([{ bus: a.buses![0]!.id, level: 0.5 }]);
		// The switched-off clip stays out; the live clip's notes are in seconds at 100 bpm.
		expect(a.clips.map((c) => [c.name, c.start, c.duration, c.muted])).toEqual([
			["Piano", 0, 4.8, undefined],
			["Muted", 4.8, 2.4, true],
		]);
		// Bitwig writes loopStart/loopEnd on every clip; one the clip's own length is no loop.
		expect(a.clips[0]!.loop).toBeUndefined();
		expect(a.clips[0]!.notes).toEqual([{ t: 0, d: 0.6, p: 62, v: 0.8 }]);
		// The clip's CC 7 lane (a Bitwig expression Points inside the clip) comes along as an expression lane.
		expect(a.clips[0]!.lanes).toEqual([
			{ kind: "cc", controller: 7, points: [{ t: 0, v: 0.7874 }] },
		]);
		expect(read.dropped).toEqual(["TripleCheese on Piano", "clip launcher scenes"]);
	});

	it("reads a Cubase-bound file's ways: a channelless folder track skipped, colors with an alpha byte, seconds throughout", () => {
		// The shape a third-party converter writes for Cubase 14 (github.com/poznas/flp-to-dawproject); a Cubase export itself is still wanted.
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
	<Application name="Cubase" version="14.0.5" />
	<Transport><Tempo unit="bpm" value="130" id="tempo" /><TimeSignature numerator="4" denominator="4" /></Transport>
	<Structure>
		<Track contentType="tracks" id="id1" name="Input/Output" color="#929395ff" />
		<Track contentType="audio" id="id2" name="Track 3" color="#7fb2c2ff">
			<Channel role="regular" audioChannels="2" id="id3" name="Track 3" destination="id0">
				<Mute value="false" name="Mute" /><Pan value="0.5" unit="normalized" min="0" max="1" name="Pan" /><Volume value="1" unit="linear" min="0" max="2" name="Volume" />
			</Channel>
		</Track>
	</Structure>
	<Arrangement>
		<Lanes timeUnit="seconds">
			<Lanes track="id1" />
			<markers id="mk"><Marker time="17.5" name="Chorus"/></markers>
			<Points unit="bpm" id="tp"><Target parameter="tempo"/><RealPoint time="0.0" value="130.0"/><RealPoint time="10.0" value="140.0"/></Points>
			<Lanes track="id2">
				<Clips>
					<Clip time="35.740385" duration="0.461538" fadeTimeUnit="seconds" contentTimeUnit="seconds" playStart="1.5" name="hit" enable="true">
						<Audio sampleRate="44100" channels="2" duration="64.396187"><File path="audio/hit.wav" external="false" /></Audio>
					</Clip>
				</Clips>
			</Lanes>
		</Lanes>
	</Arrangement>
</Project>`;
		const read = readDawproject(xml, null, "cubase");
		const a = read.arrangement;
		// A lowercase <markers> (a converter's slip) reads as markers; tempo points in the lanes are tempo changes.
		expect(a.markers?.map((m) => [m.t, m.name])).toEqual([[17.5, "Chorus"]]);
		expect(a.tempoChanges).toEqual([{ start: 10, bpm: 140 }]);
		expect(a.tracks.map((t) => [t.name, t.colour])).toEqual([["Track 3", "sea"]]);
		expect(a.tracks[0]!.output).toBeUndefined();
		expect(a.clips.map((c) => [c.name, c.start, c.duration, c.offset])).toEqual([
			["hit", 35.7404, 0.4615, 1.5],
		]);
		expect(read.dropped).toEqual([]);
	});

	it("reads the reference writer's shape: the master first with no content type, clips naming their track, no time signature", () => {
		// As Bitwig's reference library (github.com/bitwig/dawproject) writes its test projects.
		const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project version="1.0">
    <Application name="Test" version="1.0"/>
    <Transport><Tempo unit="bpm" value="155.000000" id="id9"/></Transport>
    <Structure>
        <Track contentType="" id="id0" name="Master"><Channel audioChannels="2" role="master" id="id1"><Pan unit="normalized" value="0.500000" id="id3"/><Volume unit="linear" value="1.000000" id="id2"/></Channel></Track>
        <Track contentType="audio" id="id4" name="Audio"><Channel audioChannels="2" destination="id1" role="regular" id="id5"><Pan unit="normalized" value="0.500000" id="id7"/><Volume unit="linear" value="1.000000" id="id6"/></Channel></Track>
    </Structure>
    <Arrangement id="id8">
        <Lanes timeUnit="beats" id="id10">
            <Clips track="id4" id="id12">
                <Clip time="4.0" duration="8.0" contentTimeUnit="seconds" playStart="0.5" playStop="3.097" fadeTimeUnit="beats" fadeInTime="1.0">
                    <Audio channels="2" sampleRate="44100" duration="3.097" timeUnit="seconds" id="id11"><File path="white-glasses.wav" external="false"/></Audio>
                </Clip>
            </Clips>
        </Lanes>
    </Arrangement>
    <Scenes/>
</Project>`;
		const read = readDawproject(xml, null, "ref");
		const a = read.arrangement;
		expect([a.bpm, a.beatsPerBar, a.master]).toEqual([155, 4, 1]);
		expect(a.tracks.map((t) => t.name)).toEqual(["Audio"]);
		// 155 bpm: 4 beats are 1.5484 s, 8 beats 3.0968 s, a one-beat fade 0.3871 s; playStart in seconds.
		expect(a.clips.map((c) => [c.name, c.start, c.duration, c.offset, c.fadeIn])).toEqual([
			["white-glasses", 1.5484, 3.0968, 0.5, 0.3871],
		]);
		expect(read.files.map((f) => f.path)).toEqual(["white-glasses.wav"]);
		expect(read.dropped).toEqual(["clip launcher scenes"]);
	});

	it("plays an alias clip as its original's content, placed where the alias is", () => {
		const xml = `<Project version="1.0">
  <Transport><Tempo unit="bpm" value="120" id="t"/></Transport>
  <Structure><Track contentType="notes" id="tr" name="Keys"><Channel role="regular" id="ch"><Volume unit="linear" value="1" id="v"/></Channel></Track></Structure>
  <Arrangement id="arr"><Lanes timeUnit="beats" id="l"><Lanes track="tr" id="l2"><Clips id="c">
    <Clip time="0.0" duration="4.0" name="Riff" id="clip1"><Notes id="n1"><Note time="0" duration="1" key="60" vel="0.5"/></Notes></Clip>
    <Clip time="8.0" duration="4.0" reference="n1" name="Alias Riff"/>
    <Clip time="16.0" duration="4.0" reference="nowhere" name="Lost alias"/>
  </Clips></Lanes></Lanes></Arrangement>
</Project>`;
		const read = readDawproject(xml, null, "alias");
		expect(read.arrangement.clips.map((c) => [c.name, c.start, c.notes])).toEqual([
			["Riff", 0, [{ t: 0, d: 0.5, p: 60, v: 0.5 }]],
			["Alias Riff", 4, [{ t: 0, d: 0.5, p: 60, v: 0.5 }]],
		]);
		expect(read.dropped).toEqual(["Lost alias: its original is not in the file"]);
	});

	it("refuses what is not a project", () => {
		expect(() => readDawproject("<nope/>")).toThrow(/Not a DAWproject/);
		expect(() => readDawproject("<Project><Broken")).toThrow(/Not a DAWproject/);
	});
});

describe("sample rates", () => {
	it("each file carries the rate its Audio element declares, and the song takes the rate most files have", () => {
		const clip = (file: string, rate: number, t: number) =>
			`<Clip time="${t}" duration="1" name="${file}"><Audio algorithm="raw" channels="2" duration="1" sampleRate="${rate}" id="a${t}"><File path="audio/${file}"/></Audio></Clip>`;
		const xml = `<Project version="1.0">
  <Transport><Tempo unit="bpm" value="120" id="t"/></Transport>
  <Structure><Track contentType="audio" id="tr" name="Guitar"><Channel role="regular" id="ch"><Volume unit="linear" value="1" id="v"/></Channel></Track></Structure>
  <Arrangement id="arr"><Lanes timeUnit="seconds" id="l"><Lanes track="tr" id="l2"><Clips id="c">
    ${clip("a.wav", 44100, 0)}${clip("b.wav", 44100, 2)}${clip("c.wav", 48000, 4)}
  </Clips></Lanes></Lanes></Arrangement>
</Project>`;
		const read = readDawproject(xml, null, "rates");
		expect(read.files.map((f) => [f.path, f.sampleRate])).toEqual([
			["audio/a.wav", 44100],
			["audio/b.wav", 44100],
			["audio/c.wav", 48000],
		]);
		expect(read.arrangement.sampleRate).toBe(44100);
	});
	it("a rate a song cannot render at, or none at all, leaves the song's rate unset", () => {
		const xml = `<Project version="1.0">
  <Transport><Tempo unit="bpm" value="120" id="t"/></Transport>
  <Structure><Track contentType="audio" id="tr" name="Guitar"><Channel role="regular" id="ch"><Volume unit="linear" value="1" id="v"/></Channel></Track></Structure>
  <Arrangement id="arr"><Lanes timeUnit="seconds" id="l"><Lanes track="tr" id="l2"><Clips id="c">
    <Clip time="0" duration="1" name="x"><Audio algorithm="raw" channels="2" duration="1" sampleRate="32000" id="a"><File path="audio/x.wav"/></Audio></Clip>
    <Clip time="2" duration="1" name="y"><Audio algorithm="raw" channels="2" duration="1" id="b"><File path="audio/y.wav"/></Audio></Clip>
  </Clips></Lanes></Lanes></Arrangement>
</Project>`;
		const read = readDawproject(xml, null, "rates");
		expect(read.files.map((f) => f.sampleRate)).toEqual([32000, undefined]);
		expect(read.arrangement.sampleRate).toBeUndefined();
	});
	it("reports what it normalized: float tempo, beats, decibels, alpha colors, a missing time signature, an alias", () => {
		const xml = `<Project version="1.0">
  <Transport><Tempo unit="bpm" value="100.000167" id="t"/></Transport>
  <Structure>
    <Track contentType="tracks" id="io" name="Input/Output"/>
    <Track contentType="audio" id="tr" name="Guitar" color="#e0a0a0ff"><Channel role="regular" id="ch"><Volume unit="decibel" value="-6" id="v"/></Channel></Track>
    <Track contentType="notes" id="tr2" name="Keys"><Channel role="regular" id="ch2"><Volume unit="linear" value="1" id="v2"/></Channel></Track>
  </Structure>
  <Arrangement id="arr">
    <TempoAutomation unit="bpm" timeUnit="beats" id="ta"><Target parameter="t"/><RealPoint time="0" value="100" interpolation="hold"/><RealPoint time="8" value="120" interpolation="linear"/></TempoAutomation>
    <Lanes timeUnit="beats" id="l"><Lanes track="tr2" id="l2"><Clips id="c">
      <Clip time="0.0" duration="4.0" name="Riff" id="clip1"><Notes id="n1"><Note time="0" duration="1" key="60" vel="0.5"/></Notes></Clip>
      <Clip time="8.0" duration="4.0" reference="n1" name="Alias Riff"/>
    </Clips></Lanes></Lanes>
  </Arrangement>
</Project>`;
		const read = readDawproject(xml, null, "lint");
		expect(read.fixed).toEqual([
			"Tempo 100.000167 read as 100",
			"No time signature: 4/4 assumed",
			"Input/Output: an empty folder, skipped",
			"Colors with an alpha byte, read as six digits",
			"Levels in decibels, converted to linear",
			"Alias Riff: an alias, written as a copy",
			"Times in beats, converted to seconds through the tempo map",
		]);
		expect(read.dropped).toEqual([]);
	});
	it("a clean file in seconds normalizes nothing", () => {
		const xml = `<Project version="1.0">
  <Transport><Tempo unit="bpm" value="120" id="t"/><TimeSignature numerator="4" denominator="4" id="s"/></Transport>
  <Structure><Track contentType="audio" id="tr" name="Guitar"><Channel role="regular" id="ch"><Volume unit="linear" value="0.8" id="v"/></Channel></Track></Structure>
  <Arrangement id="arr"><Lanes timeUnit="seconds" id="l"><Lanes track="tr" id="l2"><Clips id="c">
    <Clip time="1" duration="2" name="Take"><Audio algorithm="raw" channels="2" duration="2" sampleRate="48000" id="a"><File path="audio/take.wav"/></Audio></Clip>
  </Clips></Lanes></Lanes></Arrangement>
</Project>`;
		expect(readDawproject(xml, null, "clean").fixed).toEqual([]);
	});
});

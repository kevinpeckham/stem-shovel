// @vitest-environment jsdom
import { gunzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { readAls } from "./alsRead";
import { clipNoteEvents } from "./clipNoteEvents";
import { clipSegments } from "./clipSegments";

/** A set with one of everything the reader carries: Live's own "<Tag Value='…'/>" idiom, cut down to the tags that matter. */
const set = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="11.0_11300" Creator="Ableton Live 11.3.13">
<LiveSet>
	<Annotation Value="Rough mix, Tuesday" />
	<Tracks>
		<GroupTrack Id="10">
			<Name><EffectiveName Value="Drums" /></Name>
			<Color Value="14" />
			<TrackGroupId Value="-1" />
			<DeviceChain><Mixer>
				<Sends />
				<Speaker><Manual Value="true" /></Speaker>
				<Pan><Manual Value="0" /><AutomationTarget Id="1001" /></Pan>
				<Volume><Manual Value="0.8" /><AutomationTarget Id="1002" /></Volume>
			</Mixer></DeviceChain>
		</GroupTrack>
		<AudioTrack Id="11">
			<Name><EffectiveName Value="Kick" /></Name>
			<Color Value="14" />
			<AutomationEnvelopes><Envelopes>
				<AutomationEnvelope Id="0">
					<EnvelopeTarget><PointeeId Value="1102" /></EnvelopeTarget>
					<Automation><Events>
						<FloatEvent Id="1" Time="-63072000" Value="1" />
						<FloatEvent Id="2" Time="0" Value="1" />
						<FloatEvent Id="3" Time="8" Value="0.5" />
					</Events></Automation>
				</AutomationEnvelope>
				<AutomationEnvelope Id="1">
					<EnvelopeTarget><PointeeId Value="1104" /></EnvelopeTarget>
					<Automation><Events>
						<FloatEvent Id="0" Time="-63072000" Value="0.25" />
						<FloatEvent Id="1" Time="4" Value="0.25" />
						<FloatEvent Id="2" Time="8" Value="1" />
					</Events></Automation>
				</AutomationEnvelope>
				<AutomationEnvelope Id="2">
					<EnvelopeTarget><PointeeId Value="1105" /></EnvelopeTarget>
					<Automation><Events>
						<BoolEvent Id="0" Time="-63072000" Value="true" />
						<BoolEvent Id="1" Time="8" Value="false" />
						<BoolEvent Id="2" Time="12" Value="true" />
					</Events></Automation>
				</AutomationEnvelope>
			</Envelopes></AutomationEnvelopes>
			<TrackGroupId Value="10" />
			<DeviceChain>
				<Mixer>
					<Sends>
						<TrackSendHolder Id="0"><Send><Manual Value="0.0003162277571" /><AutomationTarget Id="1103" /></Send></TrackSendHolder>
						<TrackSendHolder Id="1"><Send><Manual Value="0.25" /><AutomationTarget Id="1104" /></Send></TrackSendHolder>
					</Sends>
					<Speaker><Manual Value="true" /><AutomationTarget Id="1105" /></Speaker>
					<Pan><Manual Value="-0.5" /><AutomationTarget Id="1101" /></Pan>
					<Volume><Manual Value="1.99526238" /><AutomationTarget Id="1102" /></Volume>
				</Mixer>
				<MainSequencer>
					<ClipSlotList />
					<Sample><ArrangerAutomation><Events>
						<AudioClip Id="0" Time="4">
							<CurrentStart Value="4" />
							<CurrentEnd Value="12" />
							<Loop><LoopStart Value="0" /><LoopEnd Value="4" /><StartRelative Value="0" /><LoopOn Value="true" /><OutMarker Value="4" /></Loop>
							<Name Value="Kick loop" />
							<Color Value="14" />
							<Disabled Value="false" />
							<IsWarped Value="true" />
							<SampleRef>
								<FileRef>
									<RelativePathType Value="3" />
									<RelativePath Value="Samples/Imported/kick.wav" />
									<Path Value="/Users/me/Music/Ableton/Song Project/Samples/Imported/kick.wav" />
								</FileRef>
								<DefaultDuration Value="96000" />
								<DefaultSampleRate Value="48000" />
							</SampleRef>
							<Fade Value="true" />
							<Fades><FadeInLength Value="0.5" /><FadeOutLength Value="1" /></Fades>
							<PitchCoarse Value="0" />
							<PitchFine Value="0" />
							<SampleVolume Value="0.5" />
							<WarpMarkers>
								<WarpMarker Id="0" SecTime="0" BeatTime="0" />
								<WarpMarker Id="1" SecTime="2" BeatTime="4" />
								<WarpMarker Id="2" SecTime="2.015625" BeatTime="4.03125" />
							</WarpMarkers>
						</AudioClip>
						<AudioClip Id="1" Time="16">
							<CurrentStart Value="16" />
							<CurrentEnd Value="18" />
							<Loop><LoopStart Value="1.5" /><LoopEnd Value="3" /><StartRelative Value="0" /><LoopOn Value="false" /><OutMarker Value="3" /></Loop>
							<Name Value="Hit" />
							<Disabled Value="false" />
							<IsWarped Value="false" />
							<SampleRef>
								<FileRef>
									<RelativePath Value="../../Downloads/hit.aif" />
									<Path Value="/Users/me/Downloads/hit.aif" />
								</FileRef>
								<DefaultDuration Value="132300" />
								<DefaultSampleRate Value="44100" />
							</SampleRef>
							<Fade Value="true" />
							<Fades><FadeInLength Value="0" /><FadeOutLength Value="0" /></Fades>
							<PitchCoarse Value="-7" />
							<PitchFine Value="0" />
							<SampleVolume Value="1" />
							<WarpMarkers><WarpMarker Id="0" SecTime="1.5" BeatTime="0" /><WarpMarker Id="1" SecTime="1.515625" BeatTime="0.03125" /></WarpMarkers>
						</AudioClip>
						<AudioClip Id="2" Time="20">
							<CurrentStart Value="20" />
							<CurrentEnd Value="24" />
							<Loop><LoopStart Value="0" /><LoopEnd Value="4" /><StartRelative Value="0" /><LoopOn Value="false" /><OutMarker Value="4" /></Loop>
							<Name Value="Muted" />
							<Disabled Value="true" />
							<IsWarped Value="true" />
							<SampleRef><FileRef><RelativePath Value="Samples/Imported/kick.wav" /><Path Value="/Users/me/Music/Ableton/Song Project/Samples/Imported/kick.wav" /></FileRef></SampleRef>
							<SampleVolume Value="1" />
						</AudioClip>
					</Events></ArrangerAutomation></Sample>
				</MainSequencer>
				<DeviceChain><Devices>
					<Compressor2 Id="0"><UserName Value="" /></Compressor2>
					<PluginDevice Id="1"><UserName Value="" /><PluginDesc><Vst3PluginInfo Id="0"><Name Value="Pro-Q 3" /></Vst3PluginInfo></PluginDesc></PluginDevice>
				</Devices></DeviceChain>
			</DeviceChain>
		</AudioTrack>
		<MidiTrack Id="12">
			<Name><EffectiveName Value="Keys" /></Name>
			<Color Value="24" />
			<TrackGroupId Value="-1" />
			<DeviceChain>
				<Mixer>
					<Sends />
					<Speaker><Manual Value="false" /></Speaker>
					<Pan><Manual Value="0.25" /><AutomationTarget Id="1201" /></Pan>
					<Volume><Manual Value="1" /><AutomationTarget Id="1202" /></Volume>
				</Mixer>
				<MainSequencer>
					<ClipSlotList>
						<ClipSlot Id="0"><ClipSlot><Value><MidiClip Id="9" Time="0"><Name Value="Session idea" /></MidiClip></Value></ClipSlot></ClipSlot>
					</ClipSlotList>
					<ClipTimeable><ArrangerAutomation><Events>
						<MidiClip Id="0" Time="8">
							<CurrentStart Value="8" />
							<CurrentEnd Value="16" />
							<Loop><LoopStart Value="0" /><LoopEnd Value="4" /><StartRelative Value="1" /><LoopOn Value="true" /><OutMarker Value="4" /></Loop>
							<Name Value="Riff" />
							<Disabled Value="false" />
							<Notes>
								<KeyTracks>
									<KeyTrack Id="0">
										<Notes>
											<MidiNoteEvent Time="0" Duration="1" Velocity="127" IsEnabled="true" NoteId="1" />
											<MidiNoteEvent Time="2" Duration="0.5" Velocity="64" IsEnabled="true" NoteId="2" />
											<MidiNoteEvent Time="3" Duration="0.5" Velocity="64" IsEnabled="false" NoteId="3" />
										</Notes>
										<MidiKey Value="60" />
									</KeyTrack>
									<KeyTrack Id="1">
										<Notes><MidiNoteEvent Time="3.5" Duration="2" Velocity="100" IsEnabled="true" NoteId="4" /></Notes>
										<MidiKey Value="67" />
									</KeyTrack>
								</KeyTracks>
							</Notes>
						</MidiClip>
					</Events></ArrangerAutomation></ClipTimeable>
				</MainSequencer>
				<DeviceChain><Devices /></DeviceChain>
			</DeviceChain>
		</MidiTrack>
		<ReturnTrack Id="2">
			<Name><EffectiveName Value="A-Reverb" /></Name>
			<Color Value="9" />
			<TrackGroupId Value="-1" />
			<DeviceChain><Mixer>
				<Sends />
				<Speaker><Manual Value="true" /></Speaker>
				<Pan><Manual Value="0" /><AutomationTarget Id="201" /></Pan>
				<Volume><Manual Value="1" /><AutomationTarget Id="202" /></Volume>
			</Mixer><DeviceChain><Devices><Reverb Id="0"><UserName Value="Hall" /></Reverb></Devices></DeviceChain></DeviceChain>
		</ReturnTrack>
		<ReturnTrack Id="3">
			<Name><EffectiveName Value="B-Delay" /></Name>
			<Color Value="12" />
			<TrackGroupId Value="-1" />
			<DeviceChain><Mixer>
				<Sends />
				<Speaker><Manual Value="true" /></Speaker>
				<Pan><Manual Value="0" /><AutomationTarget Id="301" /></Pan>
				<Volume><Manual Value="1" /><AutomationTarget Id="302" /></Volume>
			</Mixer><DeviceChain><Devices /></DeviceChain></DeviceChain>
		</ReturnTrack>
	</Tracks>
	<MasterTrack>
		<Name><EffectiveName Value="Master" /></Name>
		<AutomationEnvelopes><Envelopes>
			<AutomationEnvelope Id="0">
				<EnvelopeTarget><PointeeId Value="8" /></EnvelopeTarget>
				<Automation><Events>
					<FloatEvent Id="0" Time="-63072000" Value="120" />
					<FloatEvent Id="1" Time="16" Value="120" />
					<FloatEvent Id="2" Time="16" Value="90" />
				</Events></Automation>
			</AutomationEnvelope>
			<AutomationEnvelope Id="1">
				<EnvelopeTarget><PointeeId Value="10" /></EnvelopeTarget>
				<Automation><Events>
					<EnumEvent Id="0" Time="-63072000" Value="201" />
					<EnumEvent Id="1" Time="16" Value="200" />
				</Events></Automation>
			</AutomationEnvelope>
			<AutomationEnvelope Id="2">
				<EnvelopeTarget><PointeeId Value="12" /></EnvelopeTarget>
				<Automation><Events>
					<FloatEvent Id="0" Time="-63072000" Value="0.8" />
					<FloatEvent Id="1" Time="0" Value="0.8" />
					<FloatEvent Id="2" Time="16" Value="1.5" />
				</Events></Automation>
			</AutomationEnvelope>
			<AutomationEnvelope Id="3">
				<EnvelopeTarget><PointeeId Value="13" /></EnvelopeTarget>
				<Automation><Events>
					<BoolEvent Id="0" Time="-63072000" Value="true" />
					<BoolEvent Id="1" Time="24" Value="false" />
				</Events></Automation>
			</AutomationEnvelope>
		</Envelopes></AutomationEnvelopes>
		<DeviceChain>
			<Mixer>
				<Volume><Manual Value="0.8" /><AutomationTarget Id="12" /></Volume>
				<Speaker><Manual Value="true" /><AutomationTarget Id="13" /></Speaker>
				<Tempo><Manual Value="120" /><AutomationTarget Id="8" /></Tempo>
				<TimeSignature><Manual Value="201" /><AutomationTarget Id="10" /></TimeSignature>
			</Mixer>
			<DeviceChain><Devices><Limiter Id="0"><UserName Value="" /></Limiter></Devices></DeviceChain>
		</DeviceChain>
	</MasterTrack>
	<Locators><Locators>
		<Locator Id="0"><Time Value="0" /><Name Value="Intro" /></Locator>
		<Locator Id="1"><Time Value="16" /><Name Value="Verse" /></Locator>
	</Locators></Locators>
</LiveSet>
</Ableton>`;

describe("readAls", () => {
	const read = readAls(set, "Song");
	const { arrangement: a } = read;
	const byName = (name: string) => a.tracks.find((t) => t.name === name)!;
	const busByName = (name: string) => a.buses!.find((b) => b.name === name)!;

	it("reads the tempo, its automation as steps, the meter and its change, the master and the locators", () => {
		expect(read.title).toBe("Song");
		expect(read.notes).toBe("Rough mix, Tuesday");
		expect(a.bpm).toBe(120);
		expect(a.beatsPerBar).toBe(4);
		expect(a.master).toBe(0.8);
		// The master's own lanes: its volume kept within Dawn's 0..1, its speaker as the mute (off at beat 24: 8 s + 8 beats at 90 bpm).
		expect(a.masterAutomation).toEqual({
			volume: [
				{ t: 0, v: 0.8 },
				{ t: 8, v: 1 },
			],
			mute: [
				{ t: 0, v: 0 },
				{ t: 13.333333, v: 1 },
			],
		});
		// Beat 16 at 120 bpm is 8 s; from there 90 bpm and 3/4.
		expect(a.tempoChanges).toEqual([{ start: 8, bpm: 90 }]);
		expect(a.meterChanges).toEqual([{ start: 8, beatsPerBar: 3 }]);
		expect(a.markers!.map((m) => [m.t, m.name])).toEqual([
			[0, "Intro"],
			[8, "Verse"],
		]);
		expect(read.fixed).toContain("Tempo automation read as steps at its points");
	});

	it("reads the tracks with their levels, pans, mutes, colors and envelopes; a group and the returns as buses; the routing and sends", () => {
		expect(a.tracks.map((t) => t.name)).toEqual(["Kick", "Keys"]);
		expect(a.buses!.map((b) => b.name)).toEqual(["Drums", "A-Reverb", "B-Delay"]);
		const kick = byName("Kick");
		expect(kick.kind).toBeUndefined();
		expect(kick.gain).toBe(1.25);
		expect(kick.pan).toBe(-0.5);
		expect(kick.muted).toBe(false);
		expect(kick.colour).toBeDefined();
		expect(kick.output).toBe(busByName("Drums").id);
		expect(kick.sends).toEqual([{ bus: a.buses![2]!.id, level: 0.25 }]);
		// The send envelope rides as the send's lane (beat 4 is 2 s, beat 8 is 4 s); the speaker envelope is the mute
		// lane the other way up (the speaker off at beat 8 is muted, 1, from 4 s; on again at beat 12, 6 s).
		expect(kick.automation).toEqual({
			volume: [
				{ t: 0, v: 1 },
				{ t: 4, v: 0.5 },
			],
			mute: [
				{ t: 0, v: 0 },
				{ t: 4, v: 1 },
				{ t: 6, v: 0 },
			],
			[`send:${a.buses![2]!.id}`]: [
				{ t: 0, v: 0.25 },
				{ t: 2, v: 0.25 },
				{ t: 4, v: 1 },
			],
		});
		expect(busByName("Drums").gain).toBe(0.8);
		const keys = byName("Keys");
		expect(keys.kind).toBe("midi");
		expect(keys.muted).toBe(true);
		expect(keys.pan).toBe(0.25);
		expect(keys.output).toBeUndefined();
		expect(keys.sends).toBeUndefined();
		expect(read.fixed).toContain("Kick at 6 dB: Dawn's fader stops at 1.94 dB");
	});

	it("keeps a looped warped audio clip as one looped clip, keeps an unwarped clip's start in the file, and a deactivated one switched off", () => {
		const kickClips = a.clips.filter((c) => c.trackId === byName("Kick").id);
		expect(
			kickClips.map((c) => [c.name, c.start, c.offset, c.duration, c.gain, c.fadeIn, c.fadeOut]),
		).toEqual([
			// Beats 4 to 12 at 120 bpm, a 4-beat loop twice: one clip of 4 s looping the file's first 2 s.
			["Kick loop", 2, 0, 4, 0.5, 0.25, 0.5],
			// An unwarped clip: its loop start is seconds into the file; two beats long, at the 90 bpm the tempo turns to at beat 16.
			["Hit", 8, 1.5, 1.333333, 1, 0, 0],
			// Beats 20 to 24 at the 90 bpm from beat 16: deactivated in Live, switched off here.
			["Muted", 10.666667, 0, 2.666666, 1, 0, 0],
		]);
		expect(kickClips.map((c) => c.muted)).toEqual([undefined, undefined, true]);
		expect(kickClips[0]!.loop).toEqual({ start: 0, end: 2 });
		expect(clipSegments(kickClips[0]!)).toEqual([
			{ start: 2, offset: 0, duration: 2 },
			{ start: 4, offset: 0, duration: 2 },
		]);
		expect(kickClips[1]!.loop).toBeUndefined();
		expect(new Set(kickClips.map((c) => c.sourceId)).size).toBe(2);
		expect(read.files.map((f) => [f.path, f.sampleRate])).toEqual([
			["Samples/Imported/kick.wav", 48000],
			["/Users/me/Downloads/hit.aif", 44100],
		]);
		expect(read.fixed.some((f) => f.startsWith("Kick loop"))).toBe(false);
		expect(read.dropped.some((d) => d.startsWith("Muted"))).toBe(false);
		expect(read.dropped).toContain("Hit on Kick: transposed (plays at the file's own pitch here)");
	});

	it("keeps a looped MIDI clip's loop and start marker, skipping disabled notes", () => {
		const riff = a.clips.find((c) => c.name === "Riff")!;
		// Starts a beat into the 4-beat loop (content seconds at 120 bpm): the notes once, in content time, the loop over the first 2 s.
		expect([riff.start, riff.offset, riff.duration]).toEqual([4, 0.5, 4]);
		expect(riff.loop).toEqual({ start: 0, end: 2 });
		expect(riff.notes!.map((n) => [n.t, n.d, n.p, n.v])).toEqual([
			[0, 0.5, 60, 1],
			[1, 0.25, 60, 0.5039],
			[1.75, 1, 67, 0.7874],
		]);
		// Played: beats 1..4 of the loop, then 0..4, then 0..1; the G that runs past the loop's end stops there.
		expect(
			clipNoteEvents(riff).map((e) => [e.at - riff.start, e.duration, e.pitch, e.velocity]),
		).toEqual([
			[0.5, 0.25, 60, 0.5039],
			[1.25, 0.25, 67, 0.7874],
			[1.5, 0.5, 60, 1],
			[2.5, 0.25, 60, 0.5039],
			[3.25, 0.25, 67, 0.7874],
			[3.5, 0.5, 60, 1],
		]);
		expect(read.dropped).toContain("1 session-view clip (the arrangement is what comes across)");
	});

	it("names what Live has that Dawn does not", () => {
		expect(read.dropped).toEqual(
			expect.arrayContaining([
				"Compressor on Kick",
				"Pro-Q 3 on Kick",
				"Hall on A-Reverb",
				"Limiter on the master",
			]),
		);
	});

	it("refuses what is not a Live set", () => {
		expect(() => readAls("<Project/>")).toThrow(/Not a Live set/);
		expect(() => readAls("<Ableton><Foo/></Ableton>")).toThrow(/no LiveSet/);
	});
});

describe("readAls on a set Live 12.2.1 saved (tests/als)", () => {
	const xml = strFromU8(
		gunzipSync(new Uint8Array(readFileSync("tests/als/techno-live-12.2.1.als"))),
	);
	const read = readAls(xml, "Techno Live Set");
	const { arrangement: a } = read;

	it("reads the drums group, its six tracks and their looped clips, the MIDI tracks, the returns and the master", () => {
		expect(a.bpm).toBe(124);
		expect(a.beatsPerBar).toBe(4);
		expect(a.master).toBe(0.5754);
		expect(a.buses!.map((b) => b.name)).toEqual(["DRUMS", "A-Reverb", "B-Delay"]);
		expect(a.tracks).toHaveLength(13);
		const drums = a.tracks.filter((t) => t.output === a.buses![0]!.id);
		expect(drums.map((t) => t.name)).toEqual([
			"Kick",
			"Snare",
			"Hats",
			"Tops",
			"Percussion 1",
			"Percussion 2",
		]);
		expect(a.tracks.filter((t) => t.kind === "midi")).toHaveLength(7);
		expect(a.tracks.find((t) => t.name === "Hats")!.gain).toBe(0.6972);
		expect(a.tracks.every((t) => !t.sends)).toBe(true);
		// Six clips of 64 beats at 124 bpm (30.97 s), each a loop of 16, 8 or 4 beats of a 120 bpm file (8, 4 or 2 s), kept as loops.
		expect(read.files).toHaveLength(6);
		expect(read.files[0]!.path).toBe("Samples/Imported/MARS_PK_120_kick_lunar.wav");
		const kick = a.clips.filter((c) => c.name === "MARS_PK_120_kick_lunar");
		expect(kick).toHaveLength(1);
		expect(kick[0]!.start + kick[0]!.duration).toBeCloseTo((64 * 60) / 124, 3);
		expect(kick[0]!.loop!.start).toBe(0);
		expect(kick[0]!.loop!.end).toBeCloseTo(8, 3);
		expect(clipSegments(kick[0]!)).toHaveLength(4);
		const hats = a.clips.filter((c) => c.name === "MARS_PK_120_hihat_islander");
		expect(hats).toHaveLength(1);
		expect(clipSegments(hats[0]!)).toHaveLength(16);
		expect(a.clips.every((c) => c.offset === 0)).toBe(true);
		// A 120 bpm loop warped to 124 is reported; so is the transposed percussion.
		expect(read.dropped).toContain(
			"MARS_PK_120_kick_lunar on Kick: warped from 120 to 124 bpm (plays at the file's own speed here)",
		);
		expect(read.dropped).toContain(
			"RU_PP_120_perc_modular_pulse_C on Percussion 1: transposed (plays at the file's own pitch here)",
		);
		expect(read.dropped).toContain("6 session-view clips (the arrangement is what comes across)");
		expect(read.dropped.some((d) => d.endsWith("on the master"))).toBe(true);
	});
});

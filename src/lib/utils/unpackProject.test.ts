/** @vitest-environment jsdom */
import { gzipSync, strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";
import { unpackProject } from "./unpackProject";

const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  TEMPO 100 4 4 0
  <TRACK
    NAME Guitar
    <ITEM
      POSITION 1
      LENGTH 2
      NAME Take
      <SOURCE WAVE
        FILE "/home/me/Media/take.wav"
      >
    >
  >
>`;
const dawproject = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Transport><Tempo unit="bpm" value="100" id="tempo"/></Transport>
  <Structure><Track contentType="audio" id="t1" name="Guitar"><Channel role="regular" id="c1"><Volume unit="linear" value="1" id="v1"/></Channel></Track></Structure>
  <Arrangement id="arr"><Lanes timeUnit="seconds" id="l0"><Lanes track="t1" id="l1"><Clips id="cl">
    <Clip time="1" duration="2" name="Take"><Audio algorithm="raw" channels="2" duration="4" sampleRate="48000" id="a1"><File path="audio/take.wav"/></Audio></Clip>
  </Clips></Lanes></Lanes></Arrangement>
</Project>`;

const als = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="11.0_11300" Creator="Ableton Live 11.3.13"><LiveSet><Tracks>
<AudioTrack Id="1"><Name><EffectiveName Value="Guitar" /></Name><TrackGroupId Value="-1" /><DeviceChain>
<Mixer><Sends /><Speaker><Manual Value="true" /></Speaker><Pan><Manual Value="0" /></Pan><Volume><Manual Value="1" /></Volume></Mixer>
<MainSequencer><Sample><ArrangerAutomation><Events><AudioClip Id="0" Time="2"><CurrentStart Value="2" /><CurrentEnd Value="6" />
<Loop><LoopStart Value="0" /><LoopEnd Value="4" /><StartRelative Value="0" /><LoopOn Value="false" /></Loop><Name Value="Take" /><IsWarped Value="true" />
<SampleRef><FileRef><RelativePath Value="Samples/Recorded/take.wav" /><Path Value="/home/me/Song Project/Samples/Recorded/take.wav" /></FileRef></SampleRef>
<WarpMarkers><WarpMarker Id="0" SecTime="0" BeatTime="0" /><WarpMarker Id="1" SecTime="2.4" BeatTime="4" /></WarpMarkers></AudioClip></Events></ArrangerAutomation></Sample></MainSequencer>
</DeviceChain></AudioTrack></Tracks>
<MasterTrack><DeviceChain><Mixer><Volume><Manual Value="1" /></Volume><Tempo><Manual Value="100" /><AutomationTarget Id="8" /></Tempo><TimeSignature><Manual Value="201" /><AutomationTarget Id="10" /></TimeSignature></Mixer></DeviceChain></MasterTrack>
</LiveSet></Ableton>`;

describe("unpackProject", () => {
	it("takes a Live set, gzipped as Live writes it or as plain XML, its samples among the loose files by name", () => {
		const loose = new Map([["take.wav", new Uint8Array([9])]]);
		const p = unpackProject(gzipSync(strToU8(als)), "Song.als", loose);
		expect(p.format).toBe("ableton");
		expect(p.read.title).toBe("Song");
		expect(p.read.arrangement.bpm).toBe(100);
		expect(p.read.files.map((f) => f.path)).toEqual(["Samples/Recorded/take.wav"]);
		expect(Array.from(p.entryOf("Samples/Recorded/take.wav")!)).toEqual([9]);
		expect(p.read.arrangement.clips[0]).toMatchObject({ start: 1.2, duration: 2.4, offset: 0 });
		expect(unpackProject(strToU8(als), "plain.als").format).toBe("ableton");
	});
	it("takes a zipped Live project folder, the samples by the set's own relative paths", () => {
		const zip = zipSync({
			"Song Project/Song.als": gzipSync(strToU8(als)),
			"Song Project/Backup/Song [2026-10-22 120000].als": gzipSync(strToU8(als)),
			"Song Project/Samples/Recorded/take.wav": new Uint8Array([4, 5]),
		});
		const p = unpackProject(zip, "Song Project.zip");
		expect(p.format).toBe("ableton");
		expect(p.read.title).toBe("Song");
		expect(Array.from(p.entryOf("Samples/Recorded/take.wav")!)).toEqual([4, 5]);
	});
	it("takes a bare Reaper project, finding its media among the loose files by name", () => {
		const loose = new Map([["take.wav", new Uint8Array([7])]]);
		const p = unpackProject(strToU8(rpp), "My Song.rpp", loose);
		expect(p.format).toBe("reaper");
		expect(p.read.title).toBe("My Song");
		expect(p.read.files.map((f) => f.path)).toEqual(["/home/me/Media/take.wav"]);
		expect(Array.from(p.entryOf("/home/me/Media/take.wav")!)).toEqual([7]);
		expect(
			unpackProject(strToU8(rpp), "song.RPP").entryOf("/home/me/Media/take.wav"),
		).toBeUndefined();
	});
	it("takes a zip holding a Reaper project and its media, with or without a folder", () => {
		const zip = zipSync({
			"Song/Song.rpp": strToU8(rpp),
			"Song/Media/take.wav": new Uint8Array([1, 2]),
		});
		const p = unpackProject(zip, "song.zip");
		expect(p.format).toBe("reaper");
		expect(p.read.title).toBe("Song");
		expect(Array.from(p.entryOf("/home/me/Media/take.wav")!)).toEqual([1, 2]);
		expect(Array.from(p.entryOf("Media/take.wav")!)).toEqual([1, 2]);
	});
	it("takes a DAWproject as before, the loose files standing in for a missing entry", () => {
		const zip = zipSync({ "project.xml": strToU8(dawproject) });
		const p = unpackProject(zip, "night.dawproject", new Map([["take.wav", new Uint8Array([3])]]));
		expect(p.format).toBe("dawproject");
		expect(p.read.arrangement.tracks[0]!.name).toBe("Guitar");
		expect(Array.from(p.entryOf("audio/take.wav")!)).toEqual([3]);
		expect(() => unpackProject(zipSync({ "readme.txt": strToU8("hi") }), "x.zip")).toThrow(
			/no project\.xml/,
		);
	});
});

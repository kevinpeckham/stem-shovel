/** @vitest-environment jsdom */
import { strToU8, zipSync } from "fflate";
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

describe("unpackProject", () => {
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

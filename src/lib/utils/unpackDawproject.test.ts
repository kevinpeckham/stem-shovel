/** @vitest-environment jsdom */
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";
import { unpackDawproject } from "./unpackDawproject";

const project = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Application name="Test" version="1"/>
  <Transport><Tempo unit="bpm" value="100" id="tempo"/><TimeSignature numerator="4" denominator="4" id="ts"/></Transport>
  <Structure>
    <Track contentType="audio" loaded="true" id="t1" name="Guitar">
      <Channel audioChannels="2" role="regular" id="c1"><Volume unit="linear" value="1" id="v1"/></Channel>
    </Track>
  </Structure>
  <Arrangement id="arr"><Lanes timeUnit="seconds" id="l0"><Lanes track="t1" id="l1"><Clips id="cl">
    <Clip time="1" duration="2" contentTimeUnit="seconds" playStart="0" name="Take">
      <Audio algorithm="raw" channels="2" duration="4" sampleRate="48000" id="a1"><File path="audio/take.wav"/></Audio>
    </Clip>
  </Clips></Lanes></Lanes></Arrangement>
</Project>`;
const metadata = `<?xml version="1.0" encoding="UTF-8"?><MetaData><Title>Night Song</Title></MetaData>`;

describe("unpackDawproject", () => {
	it("reads the archive and finds its audio, with or without a folder prefix", () => {
		const flat = zipSync({
			"project.xml": strToU8(project),
			"metadata.xml": strToU8(metadata),
			"audio/take.wav": new Uint8Array([1, 2, 3]),
		});
		const a = unpackDawproject(flat, "night.dawproject");
		expect(a.read.title).toBe("Night Song");
		expect(a.read.arrangement.tracks.map((t) => t.name)).toEqual(["Guitar"]);
		expect(a.read.files.map((f) => f.path)).toEqual(["audio/take.wav"]);
		expect(Array.from(a.entryOf("audio/take.wav")!)).toEqual([1, 2, 3]);
		expect(Array.from(a.entryOf("./audio/take.wav")!)).toEqual([1, 2, 3]);
		const nested = zipSync({
			"Night Song/project.xml": strToU8(project),
			"Night Song/audio/take.wav": new Uint8Array([4]),
		});
		const b = unpackDawproject(nested, "night.dawproject");
		expect(b.read.title).toBe("night");
		expect(Array.from(b.entryOf("audio/take.wav")!)).toEqual([4]);
	});
	it("takes a bare project.xml saved with the extension, and refuses a zip without one", () => {
		const bare = unpackDawproject(strToU8(project), "bare.dawproject");
		expect(bare.read.title).toBe("bare");
		expect(bare.entryOf("audio/take.wav")).toBeUndefined();
		expect(() => unpackDawproject(zipSync({ "readme.txt": strToU8("hi") }), "x.zip")).toThrow(
			/no project\.xml/,
		);
	});
});

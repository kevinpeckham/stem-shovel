import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, strToU8, unzipSync, strFromU8, zipSync } from "fflate";
import { expect, test } from "./fixtures";

/**
 * The converter page (docs/dawproject-plan.md "Roadmap", step 1), signed
 * out: a small DAWproject made here (one audio track over the static keys
 * stem, one MIDI clip, a marker) goes in through the file input, the page
 * reports what it holds, and the session bundle plus a stem per track come
 * back as one zip with the stamped clip, the stem, the MIDI file, the
 * labels and the README. Nothing is uploaded, so no song is made.
 */
test("reads a DAWproject and converts it to a session bundle and stems", async ({
	page,
	errors,
}) => {
	test.setTimeout(120_000);
	const wav = await readFile(path.resolve("static/stems/keys.wav"));
	const project = `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
  <Application name="Test" version="1"/>
  <Transport><Tempo unit="bpm" value="100" id="tempo"/><TimeSignature numerator="3" denominator="4" id="ts"/></Transport>
  <Structure>
    <Track contentType="audio" loaded="true" id="t1" name="Keys">
      <Channel audioChannels="2" role="regular" id="c1"><Volume unit="linear" value="0.8" id="v1"/></Channel>
    </Track>
    <Track contentType="notes" loaded="true" id="t2" name="Piano">
      <Channel audioChannels="2" role="regular" id="c2"><Volume unit="linear" value="1" id="v2"/></Channel>
    </Track>
  </Structure>
  <Arrangement id="arr">
    <Lanes timeUnit="seconds" id="l0">
      <Lanes track="t1" id="l1"><Clips id="cl1">
        <Clip time="0.5" duration="2" contentTimeUnit="seconds" playStart="0" name="Take">
          <Audio algorithm="raw" channels="2" duration="4" sampleRate="32000" id="a1"><File path="audio/keys.wav"/></Audio>
        </Clip>
      </Clips></Lanes>
      <Lanes track="t2" id="l2"><Clips id="cl2">
        <Clip time="1" duration="1" contentTimeUnit="seconds" playStart="0" name="Chords">
          <Notes id="n1"><Note time="0" duration="0.5" channel="0" key="60" vel="0.8" rel="0.8"/></Notes>
        </Clip>
      </Clips></Lanes>
    </Lanes>
    <Markers timeUnit="seconds" id="mk"><Marker time="0.5" name="Verse"/></Markers>
  </Arrangement>
</Project>`;
	const metadata = `<?xml version="1.0" encoding="UTF-8"?><MetaData><Title>Convert check</Title></MetaData>`;
	const dir = await mkdtemp(path.join(tmpdir(), "convert-"));
	const file = path.join(dir, "convert-check.dawproject");
	await writeFile(
		file,
		zipSync({
			"project.xml": strToU8(project),
			"metadata.xml": strToU8(metadata),
			"audio/keys.wav": new Uint8Array(wav),
		}),
	);

	await page.goto("/convert", { waitUntil: "networkidle" });
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Convert");
	await page.locator("input[type=file]").setInputFiles(file);
	const summary = page.getByLabel("What the file holds");
	await expect(summary).toContainText("Keys, Piano");
	await expect(summary).toContainText("1 audio, 1 MIDI, over 0:03");
	await expect(summary).toContainText("1 of 1 decoded");
	await expect(summary).toContainText("100 bpm, 3/4, 1 marker");
	// The file is 32 kHz, which no song renders at: the output defaults to 48 kHz and the file is listed as resampled.
	await expect(page.getByLabel("Sample rate")).toHaveValue("48000");
	await expect(summary).toContainText("keys.wav (32 kHz) is resampled");
	const panel = page.locator("[data-export-panel]");
	await expect(panel.getByText(/A stem per track \(1\)/)).toBeVisible();
	await panel.getByRole("checkbox", { name: /A stem per track/ }).check();
	await panel.getByRole("checkbox", { name: /A session bundle/ }).check();
	await panel.getByRole("checkbox", { name: /A DAWproject/ }).check();
	await panel.getByRole("checkbox", { name: /Trim the project files/ }).check();
	await panel.getByRole("checkbox", { name: /A Reaper project/ }).check();
	const [download] = await Promise.all([
		page.waitForEvent("download", { timeout: 60_000 }),
		panel.getByRole("button", { name: "Export" }).click(),
	]);
	expect(download.suggestedFilename()).toBe("Convert check.zip");
	const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)));
	const names = Object.keys(zip).sort();
	expect(names).toContain("Convert check.wav");
	// The repack: the clip's two seconds of the four-second file, played from zero.
	const repack = unzipSync(zip["Convert check.dawproject"]!);
	const audio = Object.keys(repack).filter((n) => n.startsWith("audio/"));
	expect(audio).toHaveLength(1);
	expect(strFromU8(repack["project.xml"]!)).toContain('playStart="0.000000"');
	const trimmed = repack[audio[0]!]!;
	const header = new DataView(trimmed.buffer, trimmed.byteOffset);
	// Two seconds at the song's 48 kHz, 24-bit, however many channels the file has (the test stem is mono).
	expect(header.getUint32(40, true)).toBe(2 * 48000 * header.getUint16(22, true) * 3);
	// The Reaper project as a folder: the clip over its trimmed media, the MIDI part as events.
	expect(names).toContain("Convert check Reaper/Convert check.rpp");
	const rppText = strFromU8(zip["Convert check Reaper/Convert check.rpp"]!);
	expect(rppText).toContain("TEMPO 100 3 4 0");
	expect(rppText).toContain('NAME "Take"');
	expect(rppText).toContain("<SOURCE MIDI");
	expect(names.filter((n) => n.startsWith("Convert check Reaper/media/"))).toHaveLength(1);
	expect(names).toContain("Convert check - Keys.wav");
	expect(names).not.toContain("Convert check - Piano.wav");
	const folder = "Convert check session/";
	expect(names).toContain(`${folder}clips/01 Keys - Take @ 0.500s.wav`);
	expect(names).toContain(`${folder}stems/01 Keys.wav`);
	// Every WAV at the song's rate: the stem rendered at it, the clip resampled to it.
	const rateOf = (name: string) => {
		const d = zip[name]!;
		return new DataView(d.buffer, d.byteOffset).getUint32(24, true);
	};
	expect(rateOf("Convert check - Keys.wav")).toBe(48000);
	expect(rateOf(`${folder}clips/01 Keys - Take @ 0.500s.wav`)).toBe(48000);
	expect(names).toContain(`${folder}Convert check.mid`);
	expect(strFromU8(zip[`${folder}labels.txt`]!)).toContain("0.500000\t0.500000\tVerse");
	expect(strFromU8(zip[`${folder}README.txt`]!)).toContain("1 MIDI track");
	await expect(panel.getByRole("list", { name: "Exported files" })).toContainText(
		"Convert check.wav",
	);
	expect(errors).toEqual([]);
});

/**
 * A Reaper project dropped with its media beside it: the page finds the
 * file by name, reports the Reaper format, and converts to a DAWproject
 * holding the clip over the media and the notes of the MIDI item.
 */
test("reads a Reaper project with its media and converts it to a DAWproject", async ({
	page,
	errors,
}) => {
	test.setTimeout(120_000);
	const rpp = `<REAPER_PROJECT 0.1 "7.0/test" 0 0
  SAMPLERATE 48000 0 0
  TEMPO 90 4 4 0
  MARKER 1 2 Verse 0 0 1
  <TRACK
    NAME Keys
    VOLPAN 0.8 0 -1 -1 1
    MUTESOLO 0 0 0
    <ITEM
      POSITION 0.5
      LENGTH 2
      NAME Take
      VOLPAN 1 0 1 -1
      SOFFS 0
      <SOURCE WAVE
        FILE "/somewhere/else/keys.wav"
      >
    >
  >
  <TRACK
    NAME Piano
    <ITEM
      POSITION 1
      LENGTH 1
      NAME Chords
      SOFFS 0 0
      <SOURCE MIDI
        HASDATA 1 960 QN
        E 0 90 3c 66
        E 720 80 3c 00
        E 720 b0 7b 00
      >
    >
  >
>`;
	const dir = await mkdtemp(path.join(tmpdir(), "convert-rpp-"));
	const file = path.join(dir, "reaper-check.rpp");
	await writeFile(file, rpp);
	await page.goto("/convert", { waitUntil: "networkidle" });
	await page
		.locator("input[type=file]")
		.setInputFiles([file, path.resolve("static/stems/keys.wav")]);
	const summary = page.getByLabel("What the file holds");
	await expect(summary).toContainText("reaper-check.rpp (Reaper project)");
	await expect(summary).toContainText("Keys, Piano");
	await expect(summary).toContainText("1 audio, 1 MIDI, over 0:03");
	await expect(summary).toContainText("1 of 1 decoded");
	await expect(summary).toContainText("90 bpm, 4/4, 1 marker");
	const panel = page.locator("[data-export-panel]");
	await panel.getByRole("checkbox", { name: /The mix/ }).uncheck();
	await panel.getByRole("checkbox", { name: /A DAWproject/ }).check();
	const [download] = await Promise.all([
		page.waitForEvent("download", { timeout: 60_000 }),
		panel.getByRole("button", { name: "Export" }).click(),
	]);
	expect(download.suggestedFilename()).toBe("reaper-check.dawproject");
	const project = unzipSync(new Uint8Array(await readFile((await download.path())!)));
	const xml = strFromU8(project["project.xml"]!);
	expect(xml).toContain('<Tempo unit="bpm" value="90.000000"');
	expect(xml).toContain('name="Keys"');
	expect(xml).toContain('<Clip time="0.500000" duration="2.000000"');
	// The note at 0 lasting 720 ticks at 90 bpm: half a second.
	expect(xml).toContain('<Note time="0.000000" duration="0.500000" channel="0" key="60"');
	expect(xml).toContain('<Marker time="2.000000" name="Verse"/>');
	expect(Object.keys(project).filter((n) => n.startsWith("audio/"))).toHaveLength(1);
	expect(errors).toEqual([]);
});

/**
 * An Ableton Live set (docs/dawproject-plan.md, roadmap step 4): a small
 * set made here, gzipped as Live writes it, with its sample chosen beside
 * it, is read and comes back as a DAWproject with the clip, the note, the
 * tempo and the locator where Live had them.
 */
test("reads an Ableton Live set with its sample and converts it to a DAWproject", async ({
	page,
	errors,
}) => {
	test.setTimeout(120_000);
	const als = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" MinorVersion="11.0_11300" Creator="Ableton Live 11.3.13"><LiveSet><Tracks>
<AudioTrack Id="1"><Name><EffectiveName Value="Keys" /></Name><Color Value="21" /><TrackGroupId Value="-1" /><DeviceChain>
<Mixer><Sends /><Speaker><Manual Value="true" /></Speaker><Pan><Manual Value="0" /></Pan><Volume><Manual Value="1" /></Volume></Mixer>
<MainSequencer><ClipSlotList /><Sample><ArrangerAutomation><Events>
<AudioClip Id="0" Time="0.75"><CurrentStart Value="0.75" /><CurrentEnd Value="3.75" />
<Loop><LoopStart Value="0" /><LoopEnd Value="3" /><StartRelative Value="0" /><LoopOn Value="false" /></Loop>
<Name Value="Take" /><Disabled Value="false" /><IsWarped Value="true" />
<SampleRef><FileRef><RelativePath Value="Samples/Imported/keys.wav" /><Path Value="/Users/me/Live check Project/Samples/Imported/keys.wav" /></FileRef><DefaultSampleRate Value="32000" /></SampleRef>
<Fades><FadeInLength Value="0" /><FadeOutLength Value="0" /></Fades><SampleVolume Value="1" />
<WarpMarkers><WarpMarker Id="0" SecTime="0" BeatTime="0" /><WarpMarker Id="1" SecTime="2" BeatTime="3" /></WarpMarkers>
</AudioClip></Events></ArrangerAutomation></Sample></MainSequencer><DeviceChain><Devices /></DeviceChain></DeviceChain></AudioTrack>
<MidiTrack Id="2"><Name><EffectiveName Value="Piano" /></Name><Color Value="24" /><TrackGroupId Value="-1" /><DeviceChain>
<Mixer><Sends /><Speaker><Manual Value="true" /></Speaker><Pan><Manual Value="0" /></Pan><Volume><Manual Value="1" /></Volume></Mixer>
<MainSequencer><ClipSlotList /><ClipTimeable><ArrangerAutomation><Events>
<MidiClip Id="0" Time="1.5"><CurrentStart Value="1.5" /><CurrentEnd Value="3" />
<Loop><LoopStart Value="0" /><LoopEnd Value="1.5" /><StartRelative Value="0" /><LoopOn Value="false" /></Loop>
<Name Value="Chords" /><Disabled Value="false" />
<Notes><KeyTracks><KeyTrack Id="0"><Notes><MidiNoteEvent Time="0" Duration="0.75" Velocity="101.6" IsEnabled="true" NoteId="1" /></Notes><MidiKey Value="60" /></KeyTrack></KeyTracks></Notes>
</MidiClip></Events></ArrangerAutomation></ClipTimeable></MainSequencer><DeviceChain><Devices /></DeviceChain></DeviceChain></MidiTrack>
</Tracks>
<MasterTrack><AutomationEnvelopes><Envelopes>
<AutomationEnvelope Id="0"><EnvelopeTarget><PointeeId Value="10" /></EnvelopeTarget><Automation><Events><EnumEvent Id="0" Time="-63072000" Value="201" /></Events></Automation></AutomationEnvelope>
</Envelopes></AutomationEnvelopes>
<DeviceChain><Mixer><Volume><Manual Value="1" /></Volume><Tempo><Manual Value="90" /><AutomationTarget Id="8" /></Tempo><TimeSignature><Manual Value="201" /><AutomationTarget Id="10" /></TimeSignature></Mixer></DeviceChain></MasterTrack>
<Locators><Locators><Locator Id="0"><Time Value="3" /><Name Value="Verse" /></Locator></Locators></Locators>
</LiveSet></Ableton>`;
	const dir = await mkdtemp(path.join(tmpdir(), "convert-als-"));
	const file = path.join(dir, "live-check.als");
	await writeFile(file, gzipSync(strToU8(als)));
	await page.goto("/convert", { waitUntil: "networkidle" });
	await page
		.locator("input[type=file]")
		.setInputFiles([file, path.resolve("static/stems/keys.wav")]);
	const summary = page.getByLabel("What the file holds");
	await expect(summary).toContainText("live-check.als (Live set)");
	await expect(summary).toContainText("Keys, Piano");
	await expect(summary).toContainText("1 audio, 1 MIDI, over 0:03");
	await expect(summary).toContainText("1 of 1 decoded");
	await expect(summary).toContainText("90 bpm, 4/4, 1 marker");
	const panel = page.locator("[data-export-panel]");
	await panel.getByRole("checkbox", { name: /The mix/ }).uncheck();
	await panel.getByRole("checkbox", { name: /A DAWproject/ }).check();
	const [download] = await Promise.all([
		page.waitForEvent("download", { timeout: 60_000 }),
		panel.getByRole("button", { name: "Export" }).click(),
	]);
	expect(download.suggestedFilename()).toBe("live-check.dawproject");
	const project = unzipSync(new Uint8Array(await readFile((await download.path())!)));
	const xml = strFromU8(project["project.xml"]!);
	expect(xml).toContain('<Tempo unit="bpm" value="90.000000"');
	expect(xml).toContain('name="Keys"');
	// Beats 0.75 to 3.75 at 90 bpm: half a second in, two seconds long.
	expect(xml).toContain('<Clip time="0.500000" duration="2.000000"');
	// The note at the clip's start, three quarters of a beat: half a second.
	expect(xml).toContain('<Note time="0.000000" duration="0.500000" channel="0" key="60"');
	expect(xml).toContain('<Marker time="2.000000" name="Verse"/>');
	expect(Object.keys(project).filter((n) => n.startsWith("audio/"))).toHaveLength(1);
	expect(errors).toEqual([]);
});

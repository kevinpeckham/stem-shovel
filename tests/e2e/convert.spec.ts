import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, unzipSync, strFromU8, zipSync } from "fflate";
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
	const [download] = await Promise.all([
		page.waitForEvent("download", { timeout: 60_000 }),
		panel.getByRole("button", { name: "Export" }).click(),
	]);
	expect(download.suggestedFilename()).toBe("Convert check.zip");
	const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)));
	const names = Object.keys(zip).sort();
	expect(names).toContain("Convert check.wav");
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

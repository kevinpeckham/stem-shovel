import path from "node:path";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { deleteStudioSongs, newStudioSong, expect, hooked, open, test, until } from "./fixtures";

/**
 * Export from Dawn (docs/dawn-daw-plan.md, D3): an imported recording on
 * a track routed to a bus, a MIDI clip on a piano track, the LUFS readout
 * while the song plays, then Export… with the mix, the stems per track
 * and bus, a DAWproject, the session bundle, a Sandyne project and
 * normalization, all in one zip: the zip holds each file, the mix
 * measures at the target, the DAWproject names the tracks and carries the
 * recording, the bundle is a folder with the stamped clip, the stems, the
 * MIDI file, the labels and the README, the Sandyne project is a folder
 * with the `.sand` and its sample, and the MIDI track's stem has sound in
 * it from the offline render. The bot's songs are deleted at the end.
 */
test.describe("Dawn export", () => {
	test("renders the mix, stems, a DAWproject, a session bundle and a MIDI track offline into one zip", async ({
		page,
		errors,
	}) => {
		test.setTimeout(180_000);
		await open(page, "/multitrack-recorder", "__studio");
		// A clean slate: an earlier run's song would otherwise load with its clips.
		await deleteStudioSongs(page);
		await newStudioSong(page);
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		// An ASCII title: headless Chromium reports a download whose name holds a non-ASCII character
		// (the default title's middle dots) as "download" (FINDINGS.md, Testing).
		await page.getByLabel("Song title").fill("Export check");
		await page.getByLabel("Song title").press("Enter");
		await page.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 30_000,
		});
		// A bus the track goes to, and a MIDI piano track with a few notes placed straight on the arrangement.
		await page.getByRole("button", { name: "Add MIDI track" }).click();
		await until(page, ([w]) => w.__studio.arrangement.tracks.some((t: any) => t.kind === "midi"));
		const ids = await hooked(page, ([w]) => {
			const s = w.__studio;
			const busId = s.addBus("Keys bus");
			const audio = s.arrangement.tracks[0];
			const midi = s.arrangement.tracks.find((t: any) => t.kind === "midi");
			s.setOutput(audio.id, busId);
			s.arrangement.clips.push({
				id: "midi-clip-1",
				trackId: midi.id,
				notes: [
					{ t: 0, d: 0.5, p: 60, v: 0.9 },
					{ t: 0.5, d: 0.5, p: 64, v: 0.9 },
					{ t: 1, d: 1, p: 67, v: 0.9 },
				],
				start: 1,
				offset: 0,
				duration: 2,
				gain: 1,
				fadeIn: 0,
				fadeOut: 0,
				name: "Chords",
			});
			s.dirty = true;
			return { busId, audio: audio.id, midi: midi.id, midiName: midi.name };
		});
		// The LUFS readout reads while the song plays, and clears when it stops.
		await hooked(page, ([w]) => void w.__studio.play({ countIn: false }));
		await until(page, ([w]) => w.__studio.position > 1.5, { ms: 15_000 });
		await expect(page.getByLabel("Loudness")).toHaveText(/-?\d+\.\d LUFS/);
		await hooked(page, ([w]) => w.__studio.stop(0));
		await expect(page.getByLabel("Loudness")).toHaveText("– LUFS");
		// The MIDI track alone renders with sound in it: the piano's voices on the offline context.
		const midiStem = await hooked(
			page,
			async ([w, id]) => {
				const b = await w.__studio.render({ track: id });
				let peak = 0;
				for (let c = 0; c < b.numberOfChannels; c++)
					for (const x of b.getChannelData(c)) peak = Math.max(peak, Math.abs(x));
				return { peak, seconds: b.duration };
			},
			ids.midi,
		);
		expect(midiStem.peak).toBeGreaterThan(0.01);
		expect(midiStem.seconds).toBeGreaterThan(20);

		// Export…: everything, normalized, one zip.
		await page.getByRole("button", { name: "Song actions" }).click();
		await page.getByRole("button", { name: "Export…" }).click();
		const panel = page.locator("[data-export-panel]");
		await expect(panel).toBeVisible();
		await panel.getByRole("checkbox", { name: /A stem per track/ }).check();
		await panel.getByRole("checkbox", { name: /A stem per bus/ }).check();
		await panel.getByRole("checkbox", { name: /A DAWproject/ }).check();
		await panel.getByRole("checkbox", { name: /A session bundle/ }).check();
		await panel.getByRole("checkbox", { name: /A Sandyne project/ }).check();
		await panel.getByRole("checkbox", { name: /Normalize to -14 LUFS/ }).check();
		const [download] = await Promise.all([
			page.waitForEvent("download", { timeout: 120_000 }),
			panel.getByRole("button", { name: "Export" }).click(),
		]);
		expect(download.suggestedFilename()).toMatch(/\.zip$/);
		const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)));
		const names = Object.keys(zip).sort();
		const base = download.suggestedFilename().replace(/\.zip$/, "");
		expect(names).toContain(`${base}.wav`);
		expect(names).toContain(`${base} - Track 1.wav`);
		expect(names).toContain(`${base} - ${ids.midiName}.wav`);
		expect(names).toContain(`${base} - Keys bus.wav`);
		expect(names).toContain(`${base}.dawproject`);
		for (const n of names) expect(zip[n]!.length).toBeGreaterThan(44);
		// The DAWproject inside: the project names the tracks and the bus and carries the recording.
		const dawp = unzipSync(zip[`${base}.dawproject`]!);
		const project = strFromU8(dawp["project.xml"]!);
		expect(project).toContain('name="Track 1"');
		expect(project).toContain('name="Keys bus"');
		expect(project).toContain("<Note time=");
		expect(Object.keys(dawp).filter((n) => n.startsWith("audio/")).length).toBe(1);
		// The session bundle, a folder: the clip stamped at zero (it starts the song), a stem per track, the MIDI file, labels, README.
		const folder = `${base} session/`;
		const bundle = names.filter((n) => n.startsWith(folder)).map((n) => n.slice(folder.length));
		expect(bundle).toContain("README.txt");
		expect(bundle).toContain("labels.txt");
		expect(bundle).toContain(`${base}.mid`);
		expect(bundle.filter((n) => n.startsWith("clips/")).length).toBe(1);
		expect(bundle).toContain("stems/01 Track 1.wav");
		expect(bundle).toContain(`stems/02 ${ids.midiName}.wav`);
		const clip = zip[names.find((n) => n.startsWith(`${folder}clips/`))!]!;
		expect(strFromU8(clip.subarray(36, 40))).toBe("bext");
		expect(strFromU8(zip[`${folder}README.txt`]!)).toContain("Logic Pro");
		expect(strFromU8(zip[`${folder}labels.txt`]!)).toMatch(/^0\.000000\t0\.000000\tTempo /);
		// The Sandyne project, a folder: the .sand (JSON naming the tracks) with the recording beside it.
		const sandFolder = `${base} Sandyne/`;
		const sand = JSON.parse(strFromU8(zip[`${sandFolder}${base}.sand`]!));
		expect(sand.tracks.map((t: any) => t.name)).toEqual(["Track 1", ids.midiName]);
		expect(names.filter((n) => n.startsWith(`${sandFolder}samples/`)).length).toBe(1);
		// The panel reports the mix at the target.
		const list = panel.getByRole("list", { name: "Exported files" });
		await expect(list).toContainText(`${base}.wav`);
		await expect(list.getByText(/-14\.\d LUFS/).first()).toBeVisible();
		await expect(list).toContainText("dB applied");
		expect(errors).toEqual([]);
		await page.getByRole("button", { name: /^Close Export/ }).click();
		await deleteStudioSongs(page);
	});
});

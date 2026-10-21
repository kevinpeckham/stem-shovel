import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { deleteStudioSongs, expect, hooked, newStudioSong, open, test, until } from "./fixtures";

/**
 * A DAWproject round trip through Dawn (docs/dawproject-plan.md, phase
 * 1): a song with a recording, a bus and a MIDI clip exported as a
 * DAWproject, then that archive opened as a new song: the tracks, the bus,
 * the routing, the clips and the notes come back, the audio uploads, and
 * the report names nothing dropped.
 */
test("exports a DAWproject and opens it again as a new song", async ({ page, browser, errors }) => {
	test.setTimeout(240_000);
	await open(page, "/multitrack-recorder", "__studio");
	await deleteStudioSongs(page);
	await newStudioSong(page);
	await page.getByLabel("Song title").fill("Round trip");
	await page.getByLabel("Song title").press("Enter");
	await page.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
	await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
	await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
		ms: 60_000,
	});
	await page.getByRole("button", { name: "Add MIDI track" }).click();
	await until(page, ([w]) => w.__studio.arrangement.tracks.some((t: any) => t.kind === "midi"));
	await hooked(page, ([w]) => {
		const s = w.__studio;
		const busId = s.addBus("Keys bus");
		const audio = s.arrangement.tracks[0];
		const midi = s.arrangement.tracks.find((t: any) => t.kind === "midi");
		s.setOutput(audio.id, busId);
		s.setGain(audio.id, 0.6);
		s.arrangement.clips.push({
			id: "midi-clip-1",
			trackId: midi.id,
			notes: [
				{ t: 0, d: 0.5, p: 60, v: 0.9 },
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
	});
	// Export the DAWproject alone.
	await page.getByRole("button", { name: "Song actions", exact: true }).click();
	await page.getByRole("button", { name: "Export…" }).click();
	const panel = page.locator("[data-export-panel]");
	await panel.getByRole("checkbox", { name: /The mix/ }).uncheck();
	await panel.getByRole("checkbox", { name: /A DAWproject/ }).check();
	const [download] = await Promise.all([
		page.waitForEvent("download", { timeout: 120_000 }),
		panel.getByRole("button", { name: "Export" }).click(),
	]);
	expect(download.suggestedFilename()).toMatch(/\.dawproject$/);
	const archivePath = (await download.path())!;
	const inside = unzipSync(new Uint8Array(await readFile(archivePath)));
	expect(Object.keys(inside)).toContain("project.xml");
	await page.getByRole("button", { name: /^Close Export/ }).click();

	// Open it: a new song named from the metadata, everything back.
	await page.locator("input[type=file]").setInputFiles({
		name: "Round trip.dawproject",
		mimeType: "application/zip",
		buffer: await readFile(archivePath),
	});
	await expect(page.getByLabel("Song title")).toHaveValue("Round trip", { timeout: 60_000 });
	await until(page, ([w]) => w.__studio.arrangement.clips.length === 2, { ms: 60_000 });
	const state = await hooked(page, ([w]) => {
		const a = w.__studio.arrangement;
		return {
			tracks: a.tracks.map((t: any) => [
				t.name,
				t.kind ?? "audio",
				t.gain,
				t.output ? "bus" : "master",
			]),
			buses: (a.buses ?? []).map((b: any) => b.name),
			clips: a.clips.map((c: any) => [
				c.name,
				c.start,
				Math.round(c.duration * 10) / 10,
				c.notes?.length ?? 0,
			]),
			sources: Object.values(w.__studio.sources).map((s: any) => s.status),
		};
	});
	expect(state.buses).toEqual(["Keys bus"]);
	expect(state.tracks).toEqual([
		["Track 1", "audio", 0.6, "bus"],
		[expect.any(String), "midi", 1, "master"],
	]);
	expect(state.clips.map((c: any) => c[0]).sort()).toEqual(["Chords", "keys"]);
	expect(state.clips.find((c: any) => c[0] === "Chords")).toEqual(["Chords", 1, 2, 2]);
	expect(state.sources).toEqual(["ready"]);
	await expect(page.getByText(/“Round trip” opened: 2 tracks, 2 clips/)).toBeVisible();
	// The recording uploads under the new song.
	await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
		ms: 90_000,
	});
	await expect(page.getByText(/uploading \d/)).toHaveCount(0, { timeout: 90_000 });
	expect(errors).toEqual([]);
	await deleteStudioSongs(page);

	// Signed out, the same archive opens into the browser-kept song, and is there again after a reload.
	const visitor = await (await browser.newContext()).newPage();
	await visitor.goto("/multitrack-recorder", { waitUntil: "networkidle" });
	await visitor.waitForFunction(() => !!(window as unknown as { __studio?: unknown }).__studio);
	await visitor.locator("input[type=file]").setInputFiles({
		name: "Round trip.dawproject",
		mimeType: "application/zip",
		buffer: await readFile(archivePath),
	});
	await expect(visitor.getByLabel("Song title")).toHaveValue("Round trip", { timeout: 60_000 });
	await until(visitor, ([w]) => w.__studio.arrangement.clips.length === 2, { ms: 60_000 });
	await expect(visitor.locator("[data-local-notice]")).toBeVisible();
	await visitor.waitForTimeout(1000);
	await visitor.reload({ waitUntil: "networkidle" });
	await visitor.waitForFunction(() => !!(window as unknown as { __studio?: unknown }).__studio);
	await until(visitor, ([w]) => w.__studio.arrangement.clips.length === 2, { ms: 30_000 });
	await expect(visitor.getByLabel("Song title")).toHaveValue("Round trip");
	await until(
		visitor,
		([w]) => Object.values(w.__studio.sources).every((s: any) => s.status === "ready"),
		{ ms: 30_000 },
	);
	await visitor.context().close();
});

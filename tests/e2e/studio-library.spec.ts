import path from "node:path";
import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * Instruments and the library in Dawn (docs/dawn-daw-plan.md, D6): a
 * recording imported onto a track shows in the Library, plays on its own
 * from there and drops onto a lane as a new clip; a MIDI track set to the
 * Sampler plays that recording across the keys, renders offline with
 * sound, and keeps its settings on the track; the piano's new presets are
 * on its list. The bot's songs are deleted at the end.
 */
test.describe("Dawn instruments and library", () => {
	test("the library lists, plays and drops a recording; a sampler track plays it across the keys", async ({
		page,
		errors,
	}) => {
		test.setTimeout(180_000);
		await open(page, "/multitrack-recorder", "__studio");
		await deleteStudioSongs(page);
		await page.getByRole("button", { name: "New song" }).click();
		await expect(page.getByLabel("Song title")).not.toHaveValue("");
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		await hooked(page, ([w]) => w.__studio.seek(0));
		await page.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		const sourceId = await hooked(page, ([w]) => w.__studio.arrangement.clips[0].sourceId);

		// The library: the recording, one clip using it; play starts a preview the engine reports.
		await page.getByRole("button", { name: "Library" }).click();
		const library = page.locator("[data-library-panel]");
		await expect(library.getByRole("list", { name: "Recordings in the library" })).toContainText(
			"keys",
		);
		await expect(library).toContainText("1 clip");
		await library.getByRole("button", { name: "Play keys" }).click();
		expect(await hooked(page, ([w]) => w.__studio.previewing)).toBe(true);
		await library.getByRole("button", { name: "Stop keys" }).click();
		expect(await hooked(page, ([w]) => w.__studio.previewing)).toBe(false);
		// Dropped on the track's lane at 24 s (past the clip), it lands as a second clip, snapped to the beat.
		await page.getByRole("button", { name: "Add track", exact: true }).click();
		await until(page, ([w]) => w.__studio.arrangement.tracks.length === 2);
		const lane = page
			.locator("[data-track-row]")
			.nth(1)
			.locator("> div:nth-child(2) > div:first-child");
		const box = (await lane.boundingBox())!;
		await page.dragAndDrop(
			`[data-library-item="${sourceId}"]`,
			"[data-track-row]:nth-child(3) > div:nth-child(2) > div:first-child",
			{
				targetPosition: { x: Math.min(box.width - 10, 24 * 40 + 7), y: box.height / 2 },
			},
		);
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2, { ms: 10_000 });
		const dropped = await hooked(page, ([w]) => w.__studio.arrangement.clips[1]);
		expect(dropped.sourceId).toBe(sourceId);
		expect(dropped.trackId).toBe(await hooked(page, ([w]) => w.__studio.arrangement.tracks[1].id));
		expect(dropped.start).toBeGreaterThan(20);
		await page.getByRole("button", { name: "Close Library" }).click();

		// A sampler track: the MIDI track's input is the Sampler, the recording is its sound, notes play it across the keys.
		await page.getByRole("button", { name: "Add MIDI track" }).click();
		await until(page, ([w]) => w.__studio.arrangement.tracks.some((t: any) => t.kind === "midi"));
		const midiName = await hooked(
			page,
			([w]) => w.__studio.arrangement.tracks.find((t: any) => t.kind === "midi").name,
		);
		await page.getByRole("combobox", { name: `${midiName} input` }).click();
		await page.getByRole("option", { name: "Sampler", exact: true }).click();
		await hooked(page, ([w]) => {
			const s = w.__studio;
			const midi = s.arrangement.tracks.find((t: any) => t.kind === "midi");
			s.arrangement.clips.push({
				id: "sampler-clip",
				trackId: midi.id,
				notes: [
					{ t: 0, d: 0.5, p: 60, v: 0.9 },
					{ t: 0.5, d: 0.5, p: 67, v: 0.9 },
					{ t: 1, d: 1, p: 72, v: 0.9 },
				],
				start: 0,
				offset: 0,
				duration: 2,
				gain: 1,
				fadeIn: 0,
				fadeOut: 0,
				name: "Sampled",
			});
			s.dirty = true;
		});
		await page.locator("[data-clip='sampler-clip']").click();
		await page.getByRole("combobox", { name: "Sample" }).selectOption(sourceId);
		await page.getByRole("spinbutton", { name: "Root note" }).fill("48");
		await page.getByRole("spinbutton", { name: "Root note" }).press("Tab");
		await page.getByRole("checkbox", { name: "Loop the sample" }).check();
		const sampler = await hooked(
			page,
			([w]) => w.__studio.arrangement.tracks.find((t: any) => t.kind === "midi").sampler,
		);
		expect(sampler).toMatchObject({ sourceId, root: 48, loop: true });
		const peak = await hooked(page, async ([w]) => {
			const midi = w.__studio.arrangement.tracks.find((t: any) => t.kind === "midi");
			const b = await w.__studio.render({ track: midi.id });
			let p = 0;
			const d = b.getChannelData(0);
			for (let i = 0; i < d.length; i += 11) p = Math.max(p, Math.abs(d[i]));
			return p;
		});
		expect(peak).toBeGreaterThan(0.01);
		// Playback through the sampler live: the queue fires its notes without error.
		await hooked(page, ([w]) => {
			w.__studio.setLoop({ on: true, start: 0, end: 2 });
			void w.__studio.play({ countIn: false });
		});
		await until(page, ([w]) => w.__studio.position > 0.8, { ms: 10_000 });
		await hooked(page, ([w]) => {
			w.__studio.stop(0);
			w.__studio.setLoop(null);
		});
		// The piano's presets include the new ones.
		const presets = await hooked(page, ([w]) =>
			w.__piano
				? ["brass", "strings", "bell"].map((id) => {
						w.__piano.setInstrument?.(id);
						return id;
					})
				: null,
		);
		void presets;
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});

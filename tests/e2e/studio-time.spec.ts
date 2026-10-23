import path from "node:path";
import { deleteStudioSongs, newStudioSong, expect, hooked, open, test, until } from "./fixtures";

/**
 * Time in Dawn (docs/dawn-daw-plan.md, D5): a tempo change from the Timing
 * menu lands on the ruler and the grid, the snap and the readout follow
 * it; Detect tempo reads a recording; Stretch makes a longer recording the
 * clip follows; a MIDI track's swing is set from the clip bar and the
 * offline render still sounds. The bot's songs are deleted at the end.
 */
test.describe("Dawn time", () => {
	test("a tempo change on the ruler, snap and readout on the map, detect, stretch and swing", async ({
		page,
		errors,
	}) => {
		test.setTimeout(180_000);
		await open(page, "/multitrack-recorder", "__studio");
		await deleteStudioSongs(page);
		await newStudioSong(page);
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		// A tempo change to 60 bpm at 4 s, from the Timing menu at the playhead.
		await hooked(page, ([w]) => w.__studio.seek(4));
		await page.getByRole("button", { name: "Timing" }).click();
		await page
			.getByRole("spinbutton", { name: "Tempo at the playhead, beats per minute" })
			.fill("60");
		await page.getByRole("button", { name: "Add tempo change" }).click();
		// The song's key, and a key change at the playhead, from the same menu (Kevin, 2026-10-20).
		await page.getByRole("textbox", { name: "Song key" }).fill("C major");
		await page.getByRole("textbox", { name: "Song key" }).press("Tab");
		await page.getByRole("textbox", { name: "Key at the playhead" }).fill("A minor");
		await page.getByRole("button", { name: "Add key change" }).click();
		await page.keyboard.press("Escape");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.tempoChanges)).toEqual([
			{ start: 4, bpm: 60 },
		]);
		expect(await hooked(page, ([w]) => w.__studio.arrangement.key)).toBe("C major");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.keyChanges)).toEqual([
			{ start: 4, key: "A minor" },
		]);
		expect(await hooked(page, ([w]) => w.__studio.keyAt(5))).toBe("A minor");
		await expect(
			page.getByRole("button", { name: "Tempo change to 60 bpm at 0:04.0" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Key change to A minor at 0:04.0" }),
		).toBeVisible();
		// The grid follows: a beat is a second from 4 s on, so 5.4 snaps to 5; the readout at 6 s is bar 3, beat 3.
		expect(await hooked(page, ([w]) => w.__studio.snap(5.4))).toBe(5);
		expect(await hooked(page, ([w]) => w.__studio.snap(1.4))).toBe(1.5);
		// R on the flag makes the change a ramp: the tempo slides from 120 down to 60 over the first four seconds,
		// so halfway through them it is between, and the beats across them are fewer than at 120.
		await page.getByRole("button", { name: "Tempo change to 60 bpm at 0:04.0" }).press("r");
		await expect(
			page.getByRole("button", { name: "Tempo ramp to 60 bpm at 0:04.0" }),
		).toBeVisible();
		expect(await hooked(page, ([w]) => w.__studio.arrangement.tempoChanges)).toEqual([
			{ start: 4, bpm: 60, ramp: "beats" },
		]);
		expect(await hooked(page, ([w]) => w.__studio.snap(1.4))).not.toBe(1.5);
		await page.getByRole("button", { name: "Tempo ramp to 60 bpm at 0:04.0" }).press("r");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.tempoChanges)).toEqual([
			{ start: 4, bpm: 60 },
		]);
		await hooked(page, ([w]) => w.__studio.seek(6));
		await expect(page.getByText("3 | 3")).toBeVisible();

		// A recording: Detect tempo reads it into the song's tempo, Stretch makes it half again as long.
		await hooked(page, ([w]) => w.__studio.seek(0));
		await page.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		const before = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		await page.locator("[data-clip]").first().click();
		await page.getByRole("button", { name: "Detect tempo" }).click();
		await expect(page.getByText(/Detected \d+(\.\d)? bpm|Could not tell the tempo/)).toBeVisible();
		await page.getByRole("spinbutton", { name: "Stretch ratio" }).fill("1.5");
		await page.getByRole("button", { name: "Apply stretch" }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips[0].name.includes("×1.5"), {
			ms: 30_000,
		});
		const after = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		expect(after.sourceId).not.toBe(before.sourceId);
		expect(after.duration).toBeCloseTo(before.duration * 1.5, 0);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});

		// Warping (docs/multitrack-recorder.md "Warping a clip"): the clip told it was recorded a quarter faster than the song
		// is stretched to fit, pitch kept, no new recording; its rendering comes from the worker and the track renders.
		const field = page.getByRole("spinbutton", { name: "Clip tempo, beats per minute" });
		const songBpm = Number(await field.inputValue());
		expect(songBpm).toBeGreaterThan(0);
		await field.fill(String(songBpm * 1.25));
		await page.getByRole("button", { name: "Fit to song" }).click();
		await expect(page.locator("[data-clip]").first()).toHaveAttribute("data-warp", "×1.25");
		const warped = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		expect(warped.sourceId).toBe(after.sourceId);
		expect(warped.duration).toBeCloseTo(after.duration * 1.25, 1);
		await until(
			page,
			([w]) =>
				w.__studio.warping === 0 && !!w.__studio.clipBufferOf(w.__studio.arrangement.clips[0]),
			{ ms: 60_000 },
		);
		const warpedPeak = await hooked(page, async ([w]) => {
			const b = await w.__studio.render({ track: w.__studio.arrangement.clips[0].trackId });
			let p = 0;
			const d = b.getChannelData(0);
			for (let i = 0; i < d.length; i += 11) p = Math.max(p, Math.abs(d[i]));
			return p;
		});
		expect(warpedPeak).toBeGreaterThan(0.01);
		// Warp markers: Alt-click on the clip adds one where the pointer is; Delete on the focused marker takes it out.
		await page
			.locator("[data-clip]")
			.first()
			.click({ modifiers: ["Alt"], position: { x: 120, y: 30 } });
		await until(page, ([w]) => w.__studio.arrangement.clips[0].warp.length === 3);
		const marker = page.locator("[data-warp-marker]").first();
		await expect(marker).toBeVisible();
		await marker.focus();
		await page.keyboard.press("Delete");
		await until(page, ([w]) => w.__studio.arrangement.clips[0].warp.length === 2);
		await page.getByRole("button", { name: "Unwarp" }).click();
		const unwarped = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		expect(unwarped.warp).toBeUndefined();
		expect(unwarped.duration).toBeCloseTo(after.duration, 1);

		// A MIDI track with notes on the off-beats: swing from the clip bar lands on the track; the render still sounds.
		await page.getByRole("button", { name: "Add MIDI track" }).click();
		await until(page, ([w]) => w.__studio.arrangement.tracks.some((t: any) => t.kind === "midi"));
		await hooked(page, ([w]) => {
			const s = w.__studio;
			const midi = s.arrangement.tracks.find((t: any) => t.kind === "midi");
			s.arrangement.clips.push({
				id: "swing-clip",
				trackId: midi.id,
				notes: [0, 0.25, 0.5, 0.75, 1, 1.25].map((t) => ({ t, d: 0.2, p: 60, v: 0.9 })),
				start: 0,
				offset: 0,
				duration: 2,
				gain: 1,
				fadeIn: 0,
				fadeOut: 0,
				name: "Hats",
			});
			s.dirty = true;
		});
		await page.locator("[data-clip='swing-clip']").click();
		const swing = page.getByRole("slider", { name: "Swing" });
		await swing.fill("0.6");
		await expect(page.getByText("60%")).toBeVisible();
		const feel = await hooked(
			page,
			([w]) => w.__studio.arrangement.tracks.find((t: any) => t.kind === "midi").swing,
		);
		expect(feel).toBe(0.6);
		const peak = await hooked(page, async ([w]) => {
			const midi = w.__studio.arrangement.tracks.find((t: any) => t.kind === "midi");
			const b = await w.__studio.render({ track: midi.id });
			let p = 0;
			const d = b.getChannelData(0);
			for (let i = 0; i < d.length; i += 11) p = Math.max(p, Math.abs(d[i]));
			return p;
		});
		expect(peak).toBeGreaterThan(0.01);
		// The flag's Delete takes the change away, the readout back to the straight count.
		await page.getByRole("button", { name: "Tempo change to 60 bpm at 0:04.0" }).focus();
		await page.keyboard.press("Delete");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.tempoChanges ?? [])).toEqual([]);
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});

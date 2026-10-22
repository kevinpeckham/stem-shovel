import { deleteStudioSongs, newStudioSong, expect, hooked, open, test } from "./fixtures";

/**
 * Studio phase 3b (docs/multitrack-recorder.md): the piano-roll editor on
 * a MIDI clip. A click on empty grid adds a note on the grid step, a note
 * drags in time and pitch, the arrow keys nudge the selection, the
 * velocity slider sets it, Delete removes it, and every edit lands on the
 * engine as a sorted clip. The song is deleted at the end.
 */
test("the piano roll adds, moves, nudges, re-velocities and removes notes", async ({
	page,
	errors,
}) => {
	await open(page, "/multitrack-recorder", "__studio");
	await deleteStudioSongs(page);
	await newStudioSong(page);
	// A MIDI clip of a rising line, straight into the arrangement (the recorder is another spec's business).
	await hooked(page, ([w]) => {
		const s = w.__studio;
		const t = s.addTrack({ source: "piano", channel: "stereo" }, undefined, "midi");
		const notes = [60, 62, 64, 65, 67].map((p, i) => ({ t: i * 0.5, d: 0.45, p, v: 0.6 }));
		s.addClip({
			trackId: t.id,
			notes,
			start: 0,
			offset: 0,
			duration: 3,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Piano · Take 1",
		});
	});
	const pitches = () =>
		hooked(page, ([w]) =>
			w.__studio.arrangement.clips[0].notes.map((n: any) => [n.t, n.p, n.d, n.v]),
		);
	// Double-clicking the clip opens the editor, centred on the notes.
	await page.getByRole("button", { name: /Piano · Take 1 at/ }).dblclick();
	const roll = page.getByRole("application", { name: "Notes" });
	await expect(roll).toBeVisible();
	await expect(page.getByRole("dialog", { name: "Notes · Piano · Take 1" })).toBeVisible();
	await expect(roll.getByRole("button", { name: "C4 at 0:00.0, 0.45 s" })).toBeVisible();

	// Add: a click on the C4 row at 1.5 s makes a half-beat note there (120 bpm: a quarter second), selected.
	const key = page.getByRole("button", { name: "Sound C4" });
	await key.scrollIntoViewIfNeeded();
	const kb = (await key.boundingBox())!;
	const grid = (await roll.locator("[data-roll-grid]").boundingBox())!;
	const px = 120;
	await page.mouse.click(grid.x + 1.5 * px + 2, kb.y + kb.height / 2);
	expect(await pitches()).toContainEqual([1.5, 60, 0.25, 0.8]);
	const added = roll.getByRole("button", { name: "C4 at 0:01.5, 0.25 s" });
	await expect(added).toHaveAttribute("aria-pressed", "true");

	// Drag: a quarter second right and two rows up lands on the grid at 1.75 s, D4.
	const ab = (await added.boundingBox())!;
	await page.mouse.move(ab.x + 6, ab.y + ab.height / 2);
	await page.mouse.down();
	await page.mouse.move(ab.x + 6 + 0.25 * px, ab.y + ab.height / 2 - 28, { steps: 8 });
	await page.mouse.up();
	expect(await pitches()).toContainEqual([1.75, 62, 0.25, 0.8]);

	// Nudge: up a semitone and right a step; Shift-up an octave.
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Shift+ArrowUp");
	expect(await pitches()).toContainEqual([2, 75, 0.25, 0.8]);

	// Velocity for the selection.
	await roll.locator("..").getByLabel("Velocity of the selected notes").fill("0.3");
	expect(await pitches()).toContainEqual([2, 75, 0.25, 0.3]);

	// Delete the selection (the keys go to the grid, not the slider); the original five remain, still sorted.
	await roll.focus();
	await page.keyboard.press("Delete");
	expect((await pitches()).map((n: number[]) => n[1])).toEqual([60, 62, 64, 65, 67]);
	// Undo brings it back (every edit was one step).
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Undo" }).click();
	expect((await pitches()).map((n: number[]) => n[1])).toEqual([60, 62, 64, 65, 67, 75]);

	// An expression lane: Sustain from the Lane menu, a point by a click at 1 s (held to the next), then the lane removed.
	await page.getByLabel("Add an expression lane").selectOption("cc:64");
	const lane = roll.locator('[data-lane="cc:64"]');
	await expect(lane).toBeVisible();
	const lanes = () =>
		hooked(page, ([w]) =>
			(w.__studio.arrangement.clips[0].lanes ?? []).map((l: any) => [
				l.kind,
				l.controller,
				l.points,
			]),
		);
	expect(await lanes()).toEqual([["cc", 64, []]]);
	// The lanes sit pinned to the bottom of the roll's view: a click a second in, near the top of the lane, is a point at 1 s near full.
	const lb = (await lane.boundingBox())!;
	await page.mouse.click(lb.x + 56 + 1 * px + 2, lb.y + 8);
	const [[, , points]] = await lanes();
	expect(points).toHaveLength(1);
	expect(points[0].t).toBe(1);
	expect(points[0].v).toBeGreaterThan(0.7);
	await page.getByRole("button", { name: "Remove the Sustain lane" }).click();
	expect(await lanes()).toEqual([]);
	expect(errors).toEqual([]);
	await deleteStudioSongs(page);
});

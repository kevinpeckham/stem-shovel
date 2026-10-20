import path from "node:path";
import { deleteStudioSongs, newStudioSong, expect, hooked, open, test, until } from "./fixtures";

/**
 * Editing depth in Dawn (docs/dawn-daw-plan.md, D4): a recording imported
 * over itself keeps the first as a take, the take lanes open and a swipe
 * comps a region from it; the pieces crossfade where they overlap; a
 * selection of several clips consolidates into one new recording; Reverse
 * makes another; a marker lands on the ruler and jumps the playhead; a
 * ripple delete closes the gap. The bot's songs are deleted at the end.
 */
test.describe("Dawn editing", () => {
	test("comps from a take, crossfades, consolidates, reverses, marks and ripples", async ({
		page,
		errors,
	}) => {
		test.setTimeout(180_000);
		await open(page, "/multitrack-recorder", "__studio");
		await deleteStudioSongs(page);
		await newStudioSong(page);
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		const file = path.resolve("static/stems/keys.wav");
		const input = page.locator("input[type=file]");
		await hooked(page, ([w]) => w.__studio.seek(0));
		await input.setInputFiles(file);
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		// The same file again, then the second recording becomes a take behind the first (as recording over a part does; an import lands beside it).
		await hooked(page, ([w]) => w.__studio.seek(0));
		await input.setInputFiles(file);
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		await hooked(page, ([w]) => {
			const s = w.__studio;
			const [a, b] = s.arrangement.clips;
			a.alternates = [b.sourceId];
			s.deleteClip(b.id);
		});
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		const before = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		const takeId = before.alternates[0];

		// Take lanes: T opens one lane for the take; a swipe over 5 s to 10 s comps that region from it.
		await page.getByRole("button", { name: "Takes for Track 1" }).click();
		const lane = page.locator(`[data-take-lane="${takeId}"] [role=button]`);
		await expect(lane).toBeVisible();
		const box = (await lane.boundingBox())!;
		const pxPerSecond = box.width / before.duration;
		await page.mouse.move(box.x + 5 * pxPerSecond, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 10 * pxPerSecond, box.y + box.height / 2, { steps: 5 });
		await page.mouse.up();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 3, { ms: 5_000 });
		const pieces = await hooked(page, ([w]) =>
			[...w.__studio.arrangement.clips]
				.sort((a: any, b: any) => a.start - b.start)
				.map((c: any) => ({
					src: c.sourceId,
					start: +c.start.toFixed(2),
					end: +(c.start + c.duration).toFixed(2),
				})),
		);
		expect(pieces[1].src).toBe(takeId);
		expect(pieces[0].src).toBe(before.sourceId);
		expect(pieces[2].src).toBe(before.sourceId);
		// The pieces overlap by the crossfade, so the join is drawn equal power.
		expect(pieces[0].end).toBeGreaterThan(pieces[1].start);
		await expect(
			page.locator("[data-clip]").first().locator("[data-fade-out='power']"),
		).toHaveCount(1);
		// The mix still renders with sound through the crossfades.
		const peak = await hooked(page, async ([w]) => {
			const b = await w.__studio.render();
			let p = 0;
			const d = b.getChannelData(0);
			for (let i = 0; i < d.length; i += 11) p = Math.max(p, Math.abs(d[i]));
			return p;
		});
		expect(peak).toBeGreaterThan(0.05);

		// Consolidate: the three selected (click, then Shift-clicks) become one new recording, which uploads like an import.
		const clips = page.locator("[data-clip]");
		await clips.nth(0).click();
		await clips.nth(1).click({ modifiers: ["Shift"] });
		await clips.nth(2).click({ modifiers: ["Shift"] });
		await expect(page.getByRole("button", { name: "Remove 3" })).toBeVisible();
		await page.getByRole("button", { name: "Consolidate" }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1, { ms: 10_000 });
		const merged = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		expect(merged.name).toMatch(/\(consolidated\)$/);
		expect(merged.sourceId).not.toBe(before.sourceId);
		expect(merged.start).toBe(0);
		expect(merged.duration).toBeCloseTo(before.duration, 1);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});

		// Reverse: another new recording, back to front; the clip follows it.
		await page.locator("[data-clip]").first().click();
		await page.getByRole("button", { name: "Reverse" }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips[0].name.endsWith("(reversed)"), {
			ms: 10_000,
		});
		const reversed = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		expect(reversed.sourceId).not.toBe(merged.sourceId);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});

		// A marker at 3 s: the flag on the ruler, a click on it brings the playhead back.
		await hooked(page, ([w]) => w.__studio.seek(3));
		await page.getByRole("button", { name: "Add marker" }).click();
		const marker = page.getByRole("button", { name: /^Marker Marker 1 at/ });
		await expect(marker).toBeVisible();
		await hooked(page, ([w]) => w.__studio.seek(12));
		await marker.click();
		expect(await hooked(page, ([w]) => w.__studio.position)).toBeCloseTo(3, 2);
		// The M key adds another; Delete on a focused flag removes it.
		await page.keyboard.press("m");
		await expect(page.getByRole("button", { name: /^Marker Marker 2 at/ })).toBeVisible();
		await marker.focus();
		await page.keyboard.press("Delete");
		await expect(marker).toHaveCount(0);
		expect(await hooked(page, ([w]) => w.__studio.markers.length)).toBe(1);

		// Split at 5 s, then a ripple delete of the first piece pulls the second back to the start.
		await hooked(page, ([w]) => w.__studio.seek(5));
		await page.locator("[data-clip]").first().click();
		await page.keyboard.press("s");
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2, { ms: 5_000 });
		await page.locator("[data-clip]").first().click();
		await page.keyboard.press("Shift+Delete");
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1, { ms: 5_000 });
		expect(await hooked(page, ([w]) => w.__studio.arrangement.clips[0].start)).toBe(0);
		// Undo brings the piece back.
		await page.keyboard.press("ControlOrMeta+z");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.clips.length)).toBe(2);
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});

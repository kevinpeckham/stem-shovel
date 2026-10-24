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

		// The gain line (docs/multitrack-recorder.md "Clip gain envelopes"): shown, a press on the clip adds a point, a point
		// dragged down lowers the factor there, the render carries it, and Clear line takes it away.
		await page.locator("[data-clip]").first().click();
		await page.getByRole("button", { name: "Gain line" }).click();
		const clipBox = (await page.locator("[data-clip]").first().boundingBox())!;
		await page.mouse.click(clipBox.x + clipBox.width * 0.5, clipBox.y + clipBox.height * 0.5);
		await expect(page.locator("[data-gain-point]")).toHaveCount(1);
		const point = page.locator("[data-gain-point]").first();
		const pointBox = (await point.boundingBox())!;
		await page.mouse.move(pointBox.x + pointBox.width / 2, pointBox.y + pointBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(
			pointBox.x + pointBox.width / 2,
			pointBox.y + pointBox.height / 2 + clipBox.height * 0.4,
			{ steps: 4 },
		);
		await page.mouse.up();
		const envelope = await hooked(page, ([w]) => w.__studio.arrangement.clips[0].gainEnvelope);
		expect(envelope).toHaveLength(1);
		expect(envelope[0].v).toBeLessThan(0.3);
		await expect(page.getByRole("button", { name: "Gain line (1)" })).toBeVisible();
		// Rendered, the clip is quieter after the point than the same clip without the line.
		const quiet = await hooked(page, async ([w]) => {
			const b = await w.__studio.render();
			const d = b.getChannelData(0);
			let p = 0;
			for (let i = Math.floor(d.length * 0.8); i < d.length; i += 11)
				p = Math.max(p, Math.abs(d[i]));
			return p;
		});
		await page.getByRole("button", { name: "Clear line" }).click();
		expect(
			await hooked(page, ([w]) => w.__studio.arrangement.clips[0].gainEnvelope),
		).toBeUndefined();
		const loud = await hooked(page, async ([w]) => {
			const b = await w.__studio.render();
			const d = b.getChannelData(0);
			let p = 0;
			for (let i = Math.floor(d.length * 0.8); i < d.length; i += 11)
				p = Math.max(p, Math.abs(d[i]));
			return p;
		});
		expect(quiet).toBeLessThan(loud * 0.6);
		await page.getByRole("button", { name: "Gain line" }).click();

		// A range on the ruler (docs/multitrack-recorder.md "Range edits"): Alt-drag 2 s to 4 s over the one clip, Insert silence
		// splits it and pushes the right piece later; Ripple delete of the same range closes the gap again.
		const rulerEl = page.locator(".cursor-text").first();
		const rulerBox = (await rulerEl.boundingBox())!;
		const pxPerSec = await hooked(page, ([w]) => {
			const a = document.querySelector("[data-clip]") as HTMLElement;
			return a.getBoundingClientRect().width / w.__studio.arrangement.clips[0].duration;
		});
		await page.keyboard.down("Alt");
		await page.mouse.move(rulerBox.x + 2 * pxPerSec, rulerBox.y + rulerBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(rulerBox.x + 4 * pxPerSec, rulerBox.y + rulerBox.height / 2, {
			steps: 4,
		});
		await page.mouse.up();
		await page.keyboard.up("Alt");
		await expect(page.locator("[data-range]")).toHaveCount(1);
		const lengthBefore = await hooked(page, ([w]) => w.__studio.arrangement.clips[0].duration);
		await page.getByRole("button", { name: "Insert silence" }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2, { ms: 5_000 });
		const split = await hooked(page, ([w]) =>
			[...w.__studio.arrangement.clips]
				.sort((a: any, b: any) => a.start - b.start)
				.map((c: any) => [c.start, c.duration]),
		);
		expect(split[0][0]).toBe(0);
		expect(split[0][1]).toBeCloseTo(2, 1);
		expect(split[1][0]).toBeCloseTo(4, 1);
		expect(split[1][1]).toBeCloseTo(lengthBefore - 2, 1);
		await page.getByRole("button", { name: "Ripple delete" }).click();
		await expect(page.locator("[data-range]")).toHaveCount(0);
		const closed = await hooked(page, ([w]) =>
			[...w.__studio.arrangement.clips]
				.sort((a: any, b: any) => a.start - b.start)
				.map((c: any) => [c.start, c.duration]),
		);
		expect(closed).toHaveLength(2);
		expect(closed[1][0]).toBeCloseTo(2, 1);
		// Undo twice: the one clip as it was.
		await page.keyboard.press("ControlOrMeta+z");
		await page.keyboard.press("ControlOrMeta+z");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.clips.length)).toBe(1);

		// A marker at 3 s: the flag on the ruler, a click on it brings the playhead back.
		await hooked(page, ([w]) => w.__studio.seek(3));
		await page.getByRole("button", { name: "Add marker" }).click();
		const marker = page.getByRole("button", { name: /^Marker Marker 1 at/ });
		await expect(marker).toBeVisible();
		await hooked(page, ([w]) => w.__studio.seek(12));
		await marker.click();
		expect(await hooked(page, ([w]) => w.__studio.position)).toBeCloseTo(3, 2);
		// S on the focused flag makes it a section: a band along the ruler; "." jumps the playhead to it from the start.
		await marker.focus();
		await page.keyboard.press("s");
		await expect(page.locator("[data-section]")).toHaveCount(1);
		await expect(page.getByRole("button", { name: /^Section Marker 1 at/ })).toBeVisible();
		await hooked(page, ([w]) => w.__studio.seek(0));
		await page.locator("[data-clip]").first().click();
		await page.keyboard.press("Escape");
		await page.keyboard.press(".");
		expect(await hooked(page, ([w]) => w.__studio.position)).toBeCloseTo(3, 2);
		// Back to a plain marker (the flag is labeled "Section …" meanwhile, so find it by its attribute).
		await page.locator("[data-marker]").first().focus();
		await page.keyboard.press("s");
		await expect(page.locator("[data-section]")).toHaveCount(0);
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

		// Loop: L makes the first piece's content its loop, and its right edge then drags past the recording's end to repeat it.
		await page.locator("[data-clip]").first().click();
		await page.keyboard.press("Shift+L");
		const looped = await hooked(
			page,
			([w]) => [...w.__studio.arrangement.clips].sort((a: any, b: any) => a.start - b.start)[0],
		);
		expect(looped.loop).toEqual({ start: 0, end: looped.duration });
		await expect(page.getByRole("button", { name: "Loop clip" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await hooked(page, ([w, id]) => w.__studio.trimClip(id, { end: 40 }), looped.id);
		const stretched = await hooked(
			page,
			([w, id]) => w.__studio.arrangement.clips.find((c: any) => c.id === id),
			looped.id,
		);
		expect(stretched.duration).toBeGreaterThan(looped.duration);
		await expect(page.locator(`[data-clip="${looped.id}"]`)).toContainText("↻");
		// Off again: the clip plays once, trimmed back to what its recording holds from its offset.
		await page.keyboard.press("Shift+L");
		const once = await hooked(
			page,
			([w, id]) => w.__studio.arrangement.clips.find((c: any) => c.id === id),
			looped.id,
		);
		expect(once.loop).toBeUndefined();
		const sourceSeconds = await hooked(
			page,
			([w, id]) => w.__studio.sources[id].durationSeconds,
			once.sourceId,
		);
		expect(once.duration).toBeCloseTo(sourceSeconds - once.offset, 2);

		// Switched off: Shift+M keeps the clip, dimmed, playing nothing; again switches it on.
		await page.keyboard.press("Shift+M");
		await expect(page.locator(`[data-clip="${looped.id}"]`)).toHaveAttribute("data-muted", "true");
		await expect(page.getByRole("button", { name: "Switch clip off" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await page.keyboard.press("Shift+M");
		await expect(page.locator(`[data-clip="${looped.id}"]`)).not.toHaveAttribute("data-muted");
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});

import { expect, hooked, open, test, until } from "./fixtures";

/**
 * Loop playback (docs/stem-engine.md, "Loop"): clicking a section selects
 * it as the loop's stretch (the engine's `loop`), the Loop button loops
 * it, playback wraps at its end, Escape clears the selection, and with
 * nothing selected the whole song loops. Nothing is saved.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";

test("a section loops, the selection clears, the whole song loops", async ({ page, errors }) => {
	await open(page, SONG);
	const stemsTab = page.getByRole("tab", { name: /^Stems/ });
	if (await stemsTab.count()) await stemsTab.click();
	await page.waitForFunction(() => !!(window as unknown as { __stems?: unknown }).__stems);
	const rows = page.locator("[data-stem-row]");
	test.skip((await rows.count()) === 0, `${SONG} has no stems on this server`);
	const sections = page.getByRole("tab", { name: /^[IVX]+$/ });
	test.skip((await sections.count()) < 2, `${SONG} has fewer than two sections on this server`);
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled({
		timeout: 60_000,
	});
	// The second section: selected, highlighted on every row, the playhead at its start.
	await sections.nth(1).click();
	const loop = await hooked(page, ([w]) => w.__stems.loop);
	expect(loop).not.toBeNull();
	expect(loop.end).toBeGreaterThan(loop.start);
	expect(await hooked(page, ([w]) => w.__stems.position)).toBeCloseTo(loop.start, 3);
	await expect(page.locator("[data-stem-row] [data-range]").first()).toBeVisible();
	await expect(sections.nth(1)).toHaveAttribute("data-selected", "true");

	const loopButton = page.getByRole("button", { name: "Loop", exact: true });
	await loopButton.click();
	await expect(loopButton).toHaveAttribute("aria-pressed", "true");
	// Play from just before the end: the playhead wraps to the start rather than running on.
	await hooked(page, ([w, end]) => w.__stems.seek(end - 0.6), loop.end);
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await until(
		page,
		([w, l]) =>
			w.__stems.position >= l.start && w.__stems.position < l.start + 2 && w.__stems.playing,
		{ arg: loop, ms: 8_000 },
	);
	await page.getByRole("button", { name: "Pause", exact: true }).click();

	// Escape clears the selection; the loop button then loops the whole song.
	await page.keyboard.press("Escape");
	expect(await hooked(page, ([w]) => w.__stems.loop)).toBeNull();
	await expect(sections.nth(1)).not.toHaveAttribute("data-selected", "true");
	expect(await hooked(page, ([w]) => w.__stems.looping)).toBe(true);
	await hooked(page, ([w]) => w.__stems.seek(w.__stems.duration - 0.6));
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await until(page, ([w]) => w.__stems.position < 2 && w.__stems.playing, { ms: 8_000 });
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await page.keyboard.press("l");
	expect(await hooked(page, ([w]) => w.__stems.looping)).toBe(false);
	expect(errors).toEqual([]);
});

test("a drag across a waveform selects a stretch to loop", async ({ page, errors }) => {
	await open(page, SONG);
	const stemsTab = page.getByRole("tab", { name: /^Stems/ });
	if (await stemsTab.count()) await stemsTab.click();
	await page.waitForFunction(() => !!(window as unknown as { __stems?: unknown }).__stems);
	const rows = page.locator("[data-stem-row]");
	test.skip((await rows.count()) === 0, `${SONG} has no stems on this server`);
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled({
		timeout: 60_000,
	});
	const wave = rows.first().getByRole("slider", { name: /position$/ });
	const box = (await wave.boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	const loop = await hooked(page, ([w]) => ({
		loop: w.__stems.loop,
		duration: w.__stems.duration,
	}));
	expect(loop.loop).not.toBeNull();
	expect(loop.loop.start / loop.duration).toBeCloseTo(0.3, 1);
	expect(loop.loop.end / loop.duration).toBeCloseTo(0.6, 1);
	// Every row shows the band, the comments row too.
	expect(await page.locator("[data-range]").count()).toBeGreaterThanOrEqual(await rows.count());
	expect(errors).toEqual([]);
});

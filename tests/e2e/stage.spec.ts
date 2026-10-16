import { expect, hooked, open, test } from "./fixtures";

/**
 * The Stage view (docs/visual-mixer.md) on the bot's test song and on
 * Dawn: the toggle swaps the rows for pucks, a drag writes pan and level
 * to the engine, M mutes from the keyboard, and Tracks brings the rows
 * back. Nothing is saved: the stem player keeps the mix in the browser.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";

test("the stem player's Stage drags a puck into the engine", async ({ page, errors }) => {
	// The player remembers the bot's last tab; the hook exists only while the stems view is mounted.
	await open(page, SONG);
	const stemsTab = page.getByRole("tab", { name: /^Stems/ });
	if (await stemsTab.count()) await stemsTab.click();
	await page.waitForFunction(() => !!(window as unknown as { __stems?: unknown }).__stems);
	const rows = page.locator("[data-stem-row]");
	test.skip((await rows.count()) === 0, `${SONG} has no stems on this server`);
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled({
		timeout: 60_000,
	});
	await page.getByRole("button", { name: "Stage", exact: true }).click();
	const pucks = page.locator("[data-stage-puck]");
	await expect(pucks).toHaveCount(await hooked(page, ([w]) => w.__stems.stems.length));
	await expect(rows).toHaveCount(0);

	const first = pucks.first();
	const before = await hooked(page, ([w]) => ({
		gain: w.__stems.stems[0].gain,
		pan: w.__stems.stems[0].pan,
	}));
	const box = (await first.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 6 });
	await expect(page.locator("[data-stage-readout]")).toBeVisible();
	await page.mouse.up();
	const after = await hooked(page, ([w]) => ({
		gain: w.__stems.stems[0].gain,
		pan: w.__stems.stems[0].pan,
	}));
	expect(after.pan).toBeGreaterThan(before.pan);
	expect(after.gain).toBeLessThan(before.gain);
	// Undo takes the whole drag back as one step; redo puts it again.
	await page.locator("[data-stage-strip]").getByRole("button", { name: "Undo mix move" }).click();
	const undone = await hooked(page, ([w]) => ({
		gain: w.__stems.stems[0].gain,
		pan: w.__stems.stems[0].pan,
	}));
	expect(undone).toEqual(before);
	await page.keyboard.press("ControlOrMeta+Shift+z");
	expect(await hooked(page, ([w]) => w.__stems.stems[0].pan)).toBeCloseTo(after.pan, 9);
	await page.keyboard.press("ControlOrMeta+z");
	expect(await hooked(page, ([w]) => w.__stems.stems[0].pan)).toBeCloseTo(before.pan, 9);
	// The strip shows the selection; M from the keyboard mutes it.
	await expect(page.locator("[data-stage-strip]")).toContainText("1 -");
	await first.focus();
	await page.keyboard.press("m");
	expect(await hooked(page, ([w]) => w.__stems.stems[0].muted)).toBe(true);
	await page.keyboard.press("m");

	await page.getByRole("button", { name: "Tracks", exact: true }).click();
	await expect(rows).not.toHaveCount(0);
	expect(errors).toEqual([]);
});

test("Dawn's Stage shows its tracks and keeps their menu", async ({ page, errors }) => {
	await open(page, "/multitrack-recorder", "__studio");
	const addTrack = page.getByRole("button", { name: "Add track", exact: true });
	await expect(addTrack).toBeVisible({ timeout: 60_000 });
	if ((await hooked(page, ([w]) => w.__studio.arrangement.tracks.length)) === 0)
		await addTrack.click();
	await page.getByRole("button", { name: "Stage", exact: true }).click();
	const pucks = page.locator("[data-stage-puck]");
	await expect(pucks).toHaveCount(
		await hooked(page, ([w]) => w.__studio.arrangement.tracks.length),
	);
	await pucks.last().focus();
	await page.keyboard.press("ArrowRight");
	const pan = await hooked(page, ([w]) => w.__studio.arrangement.tracks.at(-1).pan);
	expect(pan).toBeCloseTo(0.05, 6);
	// Dawn's own undo takes the nudge back.
	await page.keyboard.press("ControlOrMeta+z");
	expect(await hooked(page, ([w]) => w.__studio.arrangement.tracks.at(-1).pan)).toBeCloseTo(0, 9);
	const strip = page.locator("[data-stage-strip]");
	await strip.getByRole("button", { name: /actions$/ }).click();
	await expect(page.getByRole("button", { name: "Remove track" })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Tracks", exact: true }).click();
	await expect(page.getByRole("application", { name: "Timeline" })).toBeVisible();
	expect(errors).toEqual([]);
});

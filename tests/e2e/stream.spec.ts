import { expect, hooked, open, test, until } from "./fixtures";

/**
 * Streamed stem playback (docs/stem-streaming.md) on the test song: the
 * listener's choice forces the streamed mode, the stems open in a moment,
 * play makes sound and the position runs, a seek lands, the end parks,
 * and the footer's link switches the song back to buffered.
 */
test("streams the stems, plays, seeks, and switches back to buffered", async ({ page, errors }) => {
	await page.addInitScript(() => localStorage.setItem("stemshovel.stemMode", "streamed"));
	await open(page, "/mmkk/projects/badverbs/eat-all-the-clocks");
	await page.getByRole("tab", { name: /^Stems \(/ }).click();
	await until(page, ([w]) => !!w.__stems && w.__stems.status === "ready", { ms: 60_000 });
	expect(await hooked(page, ([w]) => w.__stems.mode)).toBe("streamed");
	const status = page.locator('span[aria-live="polite"]');
	await expect(status).toContainText("streamed");
	await hooked(page, ([w]) => w.__stems.play());
	await until(page, ([w]) => w.__stems.position > 1.5, { ms: 15_000 });
	// Something is coming out of the master: the test song's stems are not silent at the top.
	const peak = await hooked(page, ([w]) => w.__stems.meter());
	expect(peak).toBeGreaterThan(0.001);
	expect(await hooked(page, ([w]) => w.__stems.buffering)).toBe(false);
	await hooked(page, ([w]) => w.__stems.pause());
	const paused = await hooked(page, ([w]) => w.__stems.position);
	await page.waitForTimeout(400);
	expect(await hooked(page, ([w]) => w.__stems.position)).toBe(paused);
	await hooked(page, ([w]) => w.__stems.seek(30));
	expect(await hooked(page, ([w]) => w.__stems.position)).toBe(30);
	await hooked(page, ([w]) => w.__stems.play());
	await until(page, ([w]) => w.__stems.position > 31, { ms: 15_000 });
	await hooked(page, ([w]) => w.__stems.seek(w.__stems.duration - 1.5));
	await until(page, ([w]) => !w.__stems.playing && w.__stems.position === w.__stems.duration, {
		ms: 15_000,
	});
	// Back to buffered from the footer: the same song, decoded whole.
	await page.getByRole("button", { name: "play buffered" }).click();
	await until(page, ([w]) => w.__stems.mode === "buffered" && w.__stems.status === "ready", {
		ms: 60_000,
	});
	await expect(status).toContainText("decoded");
	await expect(page.getByRole("button", { name: "stream", exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});

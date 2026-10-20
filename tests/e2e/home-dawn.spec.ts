import { deleteStudioSongs, expect, open, test, until } from "./fixtures";

/**
 * The home page's Dawn demo (docs/multitrack-recorder.md, "The home demo")
 * as the bot, a system admin on dev: /admin/home makes the demo from the
 * featured song's stems when none is chosen; the home page then shows the
 * section with the song loaded in the engine, and Play moves the playhead.
 * A demo the test made is cleared and deleted at the end; one that was
 * there already is left as it was.
 */
test("the Dawn demo shows the featured song's stems and plays", async ({ page, errors }) => {
	test.setTimeout(240_000);
	await open(page, "/admin/home");
	const section = page.getByRole("heading", { name: "Dawn demo" }).locator("..");
	let made = false;
	if (await section.getByText(/^None chosen/).count()) {
		await section.getByRole("button", { name: /Make it from the featured song/ }).click();
		await expect(section.getByText(/^Chosen:/)).toBeVisible({ timeout: 120_000 });
		made = true;
	}
	await open(page, "/", "__studio");
	const demo = page.locator("[data-studio-demo]");
	await expect(demo).toBeVisible();
	await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0, { ms: 30_000 });
	await until(page, ([w]) => w.__studio.decoding === 0, { ms: 120_000 });
	await demo.getByRole("button", { name: "Play" }).click();
	await page.waitForTimeout(1500);
	expect(
		await page.evaluate(
			() => (window as unknown as { __studio: { position: number } }).__studio.position,
		),
	).toBeGreaterThan(0.5);
	await demo.getByRole("button", { name: "Stop" }).click();
	if (made) {
		// The demo the test made: chosen away on the admin page (it cannot be deleted while chosen), then deleted in Dawn.
		await open(page, "/admin/home");
		await page.getByRole("combobox", { name: "Dawn song for the home demo" }).selectOption("");
		await expect(page.getByText(/^None chosen/)).toBeVisible();
		await open(page, "/multitrack-recorder", "__studio");
		await deleteStudioSongs(page);
	}
	expect(errors).toEqual([]);
});

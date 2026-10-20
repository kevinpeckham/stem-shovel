import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * A song's stems into Dawn (docs/multitrack-recorder.md, "A song's stems
 * in"): Open stems in Dawn on the bot's test song makes a Dawn song with a
 * track and a clip per stem, named after the song; the Dawn song is
 * deleted at the end.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";

test("loads the song's stems into a new Dawn song", async ({ page, errors }) => {
	test.setTimeout(240_000);
	await open(page, SONG);
	// The player remembers the bot's last tab (Demos, Mixes); the stems are what this test counts.
	const stemsTab = page.getByRole("tab", { name: /^Stems/ });
	if (await stemsTab.count()) await stemsTab.click();
	const stems = await page.locator("[data-stem-row]").count();
	test.skip(stems === 0, `${SONG} has no stems on this server`);
	await page.getByText("Downloads", { exact: true }).click();
	await page.getByRole("menuitem", { name: "Open stems in Dawn" }).click();
	await expect(page).toHaveURL(/\/multitrack-recorder\?song=/, { timeout: 120_000 });
	await page.waitForFunction(() => !!(window as unknown as { __studio?: unknown }).__studio);
	await until(page, ([w, n]) => w.__studio.arrangement.tracks.length === n, {
		arg: stems,
		ms: 60_000,
	});
	const laid = await hooked(page, ([w]) => ({
		clips: w.__studio.arrangement.clips.length,
		names: w.__studio.arrangement.tracks.map((t: { name: string }) => t.name),
	}));
	expect(laid.clips).toBe(stems);
	expect(laid.names.length).toBe(stems);
	await expect(page.getByLabel("Song title")).toHaveValue(/eat all the clocks/i);
	await deleteStudioSongs(page);
	expect(errors).toEqual([]);
});

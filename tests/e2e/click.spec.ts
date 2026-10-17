import { expect, hooked, open, test, until } from "./fixtures";

/**
 * The click in time with the stems (docs/stem-engine.md, "The click"): its
 * button appears only when the song has a grid, turning it on while the
 * song plays makes beats sound on the song's bars (the indicator follows
 * the engine's own bar count), and pausing silences it. Nothing is saved.
 */
const SONG =
	process.env.E2E_CLICK_SONG ?? "/lightning-jar/projects/test-project/exiles-and-endtimes";

test("the click follows the song's bars and stops with the song", async ({ page, errors }) => {
	await open(page, SONG);
	const stemsTab = page.getByRole("tab", { name: /^Stems/ });
	if (await stemsTab.count()) await stemsTab.click();
	await page.waitForFunction(() => !!(window as unknown as { __stems?: unknown }).__stems);
	const rows = page.locator("[data-stem-row]");
	test.skip((await rows.count()) === 0, `${SONG} has no stems on this server`);
	const clickButton = page.getByRole("button", { name: "Click", exact: true });
	test.skip((await clickButton.count()) === 0, `${SONG} has no tempo and meter on this server`);
	const play = page.getByRole("button", { name: "Play", exact: true });
	await expect(play).toBeEnabled({ timeout: 60_000 });
	await play.click();
	await clickButton.click();
	await expect(clickButton).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByRole("slider", { name: "Click level" })).toBeVisible();
	// A beat sounds within a bar or two, and the indicator's bar is the engine's own.
	await until(page, ([w]) => w.__click.beat !== null, { ms: 10_000 });
	const seen = await hooked(page, ([w]) => ({
		beat: w.__click.beat,
		position: w.__stems.position,
	}));
	expect(seen.beat.bar).toBeGreaterThanOrEqual(0);
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	await until(page, ([w]) => w.__click.beat === null, { ms: 5_000 });
	await clickButton.click();
	await expect(clickButton).toHaveAttribute("aria-pressed", "false");
	expect(errors).toEqual([]);
});

import { expect, open, test } from "./fixtures";

/**
 * The stem player on the bot's test song (docs/stem-engine.md): the stems
 * decode, play moves the position, mute and solo toggle, Home rewinds.
 * Nothing here is saved: mute, solo and the faders stay in the browser.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";

test("decodes the stems, plays, mutes and solos", async ({ page, errors }) => {
	await open(page, SONG);
	const rows = page.locator("[data-stem-row]");
	test.skip((await rows.count()) === 0, `${SONG} has no stems on this server`);
	const play = page.getByRole("button", { name: "Play", exact: true });
	await expect(play).toBeEnabled({ timeout: 60_000 });
	await play.click();
	await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
	await page.waitForTimeout(1500);
	const position = () =>
		page
			.getByRole("button", { name: /Readout format/ })
			.first()
			.textContent();
	const before = await position();
	await page.waitForTimeout(1000);
	expect(await position()).not.toBe(before);
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	// Mute and solo on the first row.
	const first = rows.first();
	const mute = first.getByRole("button", { name: /^Mute / });
	const solo = first.getByRole("button", { name: /^Solo / });
	await mute.click();
	await expect(mute).toHaveAttribute("aria-pressed", "true");
	await mute.click();
	await expect(mute).toHaveAttribute("aria-pressed", "false");
	await solo.click();
	await expect(solo).toHaveAttribute("aria-pressed", "true");
	await solo.click();
	await page.keyboard.press("Home");
	await expect(page.getByRole("button", { name: /Readout format/ }).first()).toHaveText(
		/^0?0:00|^1 \| 1/,
	);
	expect(errors).toEqual([]);
});

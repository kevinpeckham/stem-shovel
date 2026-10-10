import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Mixes (docs/mixes.md) on the bot's test song: a WAV uploaded from the
 * song page's Mixes list lands on the new mix's own page; there the notes
 * are written, a comment left on the mix (as time, kept off the song's
 * stream), the mix renamed in place, then removed so the song is left as
 * found. In order; the tests share the mix.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";
const STAMP = `e2e ${Date.now()}`;
const MIX_PAGE = /\/mixes\/[A-Za-z0-9_-]+$/;

test.describe.configure({ mode: "serial" });

/** The newest mix's page, from the song page's list. */
async function openNewest(page: Page) {
	await open(page, SONG);
	await page.getByRole("tab", { name: /^Mixes/ }).click();
	await page
		.getByRole("region", { name: "Mixes", exact: true })
		.locator("[aria-label='All mixes'] a")
		.first()
		.click();
	await expect(page).toHaveURL(MIX_PAGE);
	return page.getByRole("region", { name: "Mix player", exact: true });
}

test("uploads a mix from the song page and lands on the mix's own page", async ({
	page,
	errors,
}) => {
	await open(page, SONG);
	await page.getByRole("tab", { name: /^Mixes/ }).click();
	const list = page.getByRole("region", { name: "Mixes", exact: true });
	await expect(list).toBeVisible();
	await list.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
	await expect(page).toHaveURL(MIX_PAGE, { timeout: 60_000 });
	const panel = page.getByRole("region", { name: "Mix player", exact: true });
	await expect(page.getByRole("heading", { level: 1 })).toContainText(/Mix v\d+/);
	await expect(panel.getByRole("slider", { name: "Mix position" })).toBeVisible();
	expect(errors).toEqual([]);
});

test("the notes are written, a comment lands at a spot, and the mix is renamed", async ({
	page,
}) => {
	const panel = await openNewest(page);
	await panel.getByRole("button", { name: "Add or Edit Notes" }).click();
	await panel.getByRole("textbox", { name: "Notes on this mix" }).fill(`${STAMP} vocal up 1 dB`);
	await panel.getByRole("button", { name: /Save/ }).click();
	await expect(panel.getByText(`${STAMP} vocal up 1 dB`)).toBeVisible();
	// A comment on the mix from its Comment button: the popover says which mix, the comment lists under it, its position as time.
	await panel.getByRole("button", { name: "Comment on this mix" }).click();
	const popover = page.locator("#song-comment");
	await expect(popover.getByRole("heading").first()).toContainText(/on mix v\d+/);
	await popover.getByLabel("Title").fill(`${STAMP} bass`);
	await popover.getByLabel("Comment", { exact: true }).fill("late in the bridge");
	await popover.getByLabel(/Position/).fill("0:05");
	await popover.getByRole("button", { name: "Post comment" }).click();
	const list = panel.getByRole("region", { name: "Comments on this mix" });
	await expect(list.getByText(`${STAMP} bass`)).toBeVisible();
	await expect(list.getByRole("button", { name: /^0:05/ })).toBeVisible();
	// Rename in place: the pencil, the box, Enter.
	await panel.getByRole("button", { name: "Rename Mix" }).click();
	const name = panel.getByRole("textbox", { name: "Mix name" });
	await name.fill(`${STAMP} final`);
	await name.press("Enter");
	await expect(panel.getByText(`${STAMP} final`).first()).toBeVisible();
});

test("the song's own Comments panel does not show the mix's comment", async ({ page }) => {
	await open(page, SONG);
	await page
		.getByRole("button", { name: /^Comments/ })
		.first()
		.click();
	const panel = page.getByRole("dialog", { name: "Comments" });
	await expect(panel).toBeVisible();
	await expect(panel.getByRole("heading", { name: `${STAMP} bass` })).toHaveCount(0);
});

test("the mix is removed with its comment, and so is anything an earlier run left", async ({
	page,
}) => {
	const panel = await openNewest(page);
	await expect(panel.getByText(`${STAMP} final`).first()).toBeVisible();
	// This run's mix, then any "keys" mix an earlier failed run left, each from its page.
	for (let i = 0; i < 10; i++) {
		page.once("dialog", (d) => void d.accept());
		await panel.getByRole("button", { name: "Delete Mix" }).click();
		await page.waitForTimeout(1200);
		const leftover = page.locator("[aria-label='All mixes'] a, [aria-label='All mixes'] button", {
			hasText: /\bkeys\b/,
		});
		if ((await leftover.count()) === 0) break;
		await leftover.first().click();
		await expect(page).toHaveURL(MIX_PAGE);
	}
	await open(page, SONG);
	await page.getByRole("tab", { name: /^Mixes/ }).click();
	const list = page.getByRole("region", { name: "Mixes", exact: true });
	await expect(list.getByText(`${STAMP} final`)).toHaveCount(0);
	await expect(list.locator("[aria-label='All mixes'] a", { hasText: /\bkeys\b/ })).toHaveCount(0);
});

import { expect, open, test } from "./fixtures";

/**
 * A demo's review on the song page (docs/uploads-and-blob.md, "Sessions
 * review"): a WAV uploaded as a demo gets an MP3 and a measured waveform
 * under the Demos view's transport; a comment is left on it from the
 * heading's pencil with a position as time, shows as a bubble and in the
 * list, stays out of the song's own comments, and is deleted; the demo is
 * removed at the end.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";
const STAMP = `e2e ${Date.now()}`;

test("comments on a demo's waveform in the Demos view", async ({ page, errors }) => {
	test.setTimeout(300_000);
	await open(page, SONG);
	const tab = page.getByRole("tab", { name: /^Demos \(\d+\)$/ });
	await expect(tab).toBeVisible();
	const panel = page.getByLabel("Demo recordings");
	// What an earlier run left behind goes first, so the counts below hold.
	await tab.click();
	while (await panel.getByLabel("Menu for keys").count()) {
		await panel.getByLabel("Menu for keys").first().click();
		page.once("dialog", (d) => d.accept());
		await panel.getByRole("menuitem", { name: "Remove demo" }).first().click();
		await page.waitForTimeout(1500);
	}
	const before = Number((await tab.textContent())?.match(/\((\d+)\)/)?.[1] ?? 0);
	// The Uploads menu's control (the panel's own shows only on a song without stems).
	await page.getByLabel(/Upload Demos/).setInputFiles("static/stems/keys.wav");
	await expect(tab).toHaveText(`Demos (${before + 1})`, { timeout: 120_000 });
	await panel.getByRole("button", { name: "Play keys" }).click();
	// A pause on the heels of play() makes Chrome log an interrupted request; let it start.
	await expect(panel.getByRole("button", { name: "Pause keys" })).toBeVisible();
	await page.waitForTimeout(800);
	await panel.getByRole("button", { name: "Pause keys" }).click();
	const review = panel.locator("[data-recording-review]");
	await expect(review).toBeVisible();
	await expect(review.getByText(/waveform is on its way/)).toHaveCount(0, { timeout: 240_000 });

	// A comment in general from the heading's pencil, with a position typed as time.
	await review.getByRole("button", { name: "Add comment on keys" }).click();
	const popover = page.locator("#song-comment");
	await expect(popover).toBeVisible();
	await expect(popover.getByRole("heading").first()).toContainText('on demo "keys"');
	await popover.getByLabel("Title").fill(`${STAMP} intro`);
	await popover.getByLabel("Comment", { exact: true }).fill("Count it in louder");
	await popover.getByLabel(/Position/).fill("0:02");
	await popover.getByRole("button", { name: "Post comment" }).click();
	await expect(popover).toBeHidden();
	await expect(review.getByRole("button", { name: `Comment: ${STAMP} intro` })).toBeVisible();
	const card = review.locator("[data-review-comment]", { hasText: STAMP });
	await expect(card).toContainText("0:02");
	// The song's own Comments row does not carry it: the one bubble on the page is the demo's.
	await expect(page.getByRole("button", { name: `Comment: ${STAMP} intro` })).toHaveCount(1);

	page.once("dialog", (d) => d.accept());
	await card.getByRole("button", { name: "Delete" }).click();
	await expect(card).toHaveCount(0);

	// The demo goes from its row's menu, the file with it.
	await panel.getByLabel("Menu for keys").click();
	page.once("dialog", (d) => d.accept());
	await panel.getByRole("menuitem", { name: "Remove demo" }).click();
	await expect(tab).toHaveText(`Demos (${before})`, { timeout: 30_000 });
	expect(errors).toEqual([]);
});

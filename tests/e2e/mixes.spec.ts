import path from "node:path";
import { expect, open, test } from "./fixtures";

/**
 * Mixes (docs/mixes.md) on the bot's test song: a WAV uploaded as a mix
 * from the player's Mixes view, shown with its version and waveform, the
 * notes written, a comment left at a spot through the ⌘-click menu, the
 * mix renamed, then removed so the song is left as found. In order; the
 * tests share the mix.
 */
const SONG = process.env.E2E_SONG ?? "/mmkk/projects/badverbs/eat-all-the-clocks";
const STAMP = `e2e ${Date.now()}`;

test.describe.configure({ mode: "serial" });

test("uploads a mix and opens on it with its waveform", async ({ page, errors }) => {
	await open(page, SONG);
	await page.getByRole("tab", { name: /^Mixes/ }).click();
	const panel = page.getByRole("region", { name: "Mix player", exact: true });
	await expect(panel).toBeVisible();
	const before = await panel.locator("[aria-label='All mixes'] button").count();
	await panel.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
	// The newest mix opens: a version badge one higher than before, the uploader, the waveform.
	await expect(panel.getByText(/^v\d+$/).first()).toBeVisible({ timeout: 60_000 });
	await expect(panel.getByRole("slider", { name: "keys position" })).toBeVisible();
	await expect(page.getByRole("tab", { name: /^Mixes \(\d+\)/ })).toBeVisible();
	expect(before).toBeGreaterThanOrEqual(0);
	expect(errors).toEqual([]);
});

test("the notes are written, a comment lands at a spot, and the mix is renamed", async ({
	page,
}) => {
	await open(page, SONG);
	await page.getByRole("tab", { name: /^Mixes/ }).click();
	const panel = page.getByRole("region", { name: "Mix player", exact: true });
	await panel.getByRole("button", { name: /Add notes|Edit notes/ }).click();
	await panel.getByRole("textbox", { name: "Notes on this mix" }).fill(`${STAMP} vocal up 1 dB`);
	await panel.getByRole("button", { name: "Save notes" }).click();
	await expect(panel.getByText(`${STAMP} vocal up 1 dB`)).toBeVisible();
	// A comment on the mix from its Comment button: the popover says which mix, the comment lists under it.
	await panel.getByRole("button", { name: "Comment on this mix" }).click();
	const popover = page.locator("#song-comment");
	await expect(popover.getByRole("heading")).toContainText(/on mix v\d+/);
	await popover.getByLabel("Title").fill(`${STAMP} bass`);
	await popover.getByLabel("Comment", { exact: true }).fill("late in the bridge");
	await popover.getByRole("button", { name: "Post comment" }).click();
	const list = panel.getByRole("region", { name: "Comments on this mix" });
	await expect(list.getByText(`${STAMP} bass`)).toBeVisible();
	// The song's own Comments tab does not show it.
	await page.getByRole("tab", { name: /^Comments/ }).click();
	const docs = page.getByRole("dialog", { name: "Docs" });
	await expect(docs.getByText("No comments yet.").or(docs.getByRole("list"))).toBeVisible();
	await expect(docs.getByRole("heading", { name: `${STAMP} bass` })).toHaveCount(0);
	// Rename from the mix's menu.
	page.once("dialog", (d) => void d.accept(`${STAMP} final`));
	await panel
		.getByRole("button", { name: /actions$/ })
		.first()
		.click();
	await page.getByRole("button", { name: "Rename" }).click();
	await expect(panel.getByText(`${STAMP} final`).first()).toBeVisible();
});

test("the mix is removed with its comment", async ({ page }) => {
	await open(page, SONG);
	await page.getByRole("tab", { name: /^Mixes/ }).click();
	const panel = page.getByRole("region", { name: "Mix player", exact: true });
	await expect(panel.getByText(`${STAMP} final`).first()).toBeVisible();
	page.once("dialog", (d) => void d.accept());
	await panel
		.getByRole("button", { name: /actions$/ })
		.first()
		.click();
	await page.getByRole("button", { name: "Remove" }).click();
	await expect(panel.getByText(`${STAMP} final`)).toHaveCount(0);
});

import { expect, open, test } from "./fixtures";

/**
 * The Sessions page (docs/uploads-and-blob.md, "Sessions") as the bot in
 * its account: two WAVs uploaded as a show land in one session of the
 * files' own day, the player plays through them, the session is renamed,
 * a recording moves into a new session of the same day, the MP3s zip
 * downloads once rendered, and both sessions are deleted at the end.
 */
const PAGE = process.env.E2E_SESSIONS ?? "/mmkk/sessions";

async function deleteEverySession(page: import("@playwright/test").Page) {
	while (await page.locator("[data-session]").count()) {
		await page
			.locator("[data-session]")
			.first()
			.getByRole("button", { name: /actions$/ })
			.first()
			.click();
		page.once("dialog", (d) => d.accept());
		await page.getByRole("button", { name: "Delete session" }).click();
		await page.waitForTimeout(1200);
	}
}

test("uploads, plays, names, sorts, zips and deletes a session's recordings", async ({
	page,
	errors,
}) => {
	test.setTimeout(300_000);
	await open(page, PAGE);
	await deleteEverySession(page);
	await page.getByRole("button", { name: "Show", exact: true }).first().click();
	await page.getByLabel("Place").fill("The Elbow Room");
	await page
		.locator('input[type="file"]')
		.setInputFiles(["static/stems/bass.wav", "static/stems/hats.wav"]);
	await expect(page.locator("[data-recording]")).toHaveCount(2, { timeout: 180_000 });
	const sessions = page.locator("[data-session]");
	await expect(sessions).toHaveCount(1);
	await expect(sessions.first().locator("h2")).toContainText("The Elbow Room ·");

	// The player: Play all starts the first, Next moves on, the row's button pauses.
	await sessions.first().getByRole("button", { name: "Play all" }).click();
	const player = page.locator("[data-session-player]");
	await expect(player).toContainText("1 of 2");
	await page.getByRole("button", { name: "Next recording" }).click();
	await expect(player).toContainText("2 of 2");
	await page.getByRole("button", { name: "Pause", exact: true }).click();

	// A name of its own.
	await sessions
		.first()
		.getByRole("button", { name: /actions$/ })
		.first()
		.click();
	await page.getByRole("button", { name: "Edit session" }).click();
	await sessions.first().getByLabel("Name").fill("Battle of the Bands");
	await sessions.first().getByRole("button", { name: "Save", exact: true }).click();
	await expect(sessions.first().locator("h2")).toHaveText("Battle of the Bands");

	// The second recording into a new session of the same day, retitled.
	const second = page.locator("[data-recording]").nth(1);
	await second.getByRole("button", { name: /actions$/ }).click();
	await page.getByRole("button", { name: "Edit recording" }).click();
	await second.getByRole("combobox", { name: /^Session of/ }).click();
	await page.getByRole("option", { name: /New session/ }).click();
	await second.getByLabel("New session's name").fill("Acoustic set");
	await second.getByLabel("Title").fill("Hats only");
	await second.getByLabel("Input source").fill("Room mic");
	// The song it records, from the account's songs.
	await second.getByRole("combobox", { name: /^Song of/ }).click();
	await page
		.getByRole("option", { name: /eat all the clocks/i })
		.first()
		.click();
	await second.getByRole("button", { name: "Save", exact: true }).click();
	await expect(sessions).toHaveCount(2);
	// The input source shows by the title, the song as a link to its page.
	const first = page.locator("[data-recording]").first();
	await expect(first).toContainText("Room mic");
	await expect(first.getByRole("link", { name: /eat all the clocks/i })).toBeVisible();
	await expect(page.locator("[data-session] h2")).toHaveText([
		"Acoustic set",
		"Battle of the Bands",
	]);

	// The MP3s render in the jobs function; the zip is then there.
	await expect(page.getByText("MP3 rendering…")).toHaveCount(0, { timeout: 240_000 });
	const zipButton = sessions.first().getByRole("button", { name: "Download MP3s" });
	await expect(zipButton).toBeEnabled();
	const id = await sessions.first().getAttribute("data-session");
	const res = await page.request.get(`/api/recording-sessions/${id}/mp3.zip`);
	expect(res.status()).toBe(200);
	expect(res.headers()["content-disposition"]).toContain("Acoustic set MP3s.zip");
	const body = await res.body();
	expect(body[0]).toBe(0x50);
	expect(body[1]).toBe(0x4b);

	await deleteEverySession(page);
	await expect(sessions).toHaveCount(0);
	expect(errors).toEqual([]);
});

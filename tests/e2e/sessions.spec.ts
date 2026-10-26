import fs from "node:fs/promises";
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
	// The upload form lives in the toolbar's "Add a recording" panel; picking files closes it.
	await page.getByRole("button", { name: "Add a recording" }).click();
	await page.getByRole("button", { name: "Show", exact: true }).first().click();
	await page.getByLabel("Place").fill("The Elbow Room");
	// The input device (a fixed list) and the input name (free text) travel with the upload.
	await page.getByLabel("Input device").first().selectOption("phone");
	await page.getByLabel("Input name").first().fill("Kevin's phone");
	await page
		.locator('input[type="file"]')
		.setInputFiles(["static/stems/bass.wav", "static/stems/hats.wav"]);
	await expect(page.locator("[data-recording]")).toHaveCount(2, { timeout: 180_000 });
	const sessions = page.locator("[data-session]");
	await expect(sessions).toHaveCount(1);
	await expect(sessions.first().locator("h2")).toContainText("The Elbow Room ·");
	await expect(page.locator("[data-recording]").first()).toContainText("Phone · Kevin's phone");

	// The player: Play all starts the first, Next moves on, the row's button pauses.
	await sessions.first().getByRole("button", { name: "Play all" }).click();
	const player = page.locator("[data-session-player]");
	await expect(player).toContainText("1 of 2");
	await page.getByRole("button", { name: "Next recording" }).click();
	await expect(player).toContainText("2 of 2");
	await page.getByRole("button", { name: "Pause", exact: true }).click();

	// The playback EQ: the element runs through Web Audio, so a change is heard and remembered on the device.
	const eqButton = player.getByRole("button", { name: "EQ", exact: true });
	await expect(eqButton).toHaveAttribute("data-active", "false");
	await eqButton.click();
	const eqPanel = page.getByRole("heading", { name: "Playback EQ" }).locator("..").locator("..");
	await expect(eqPanel).toBeVisible();
	await eqPanel.getByRole("slider", { name: "Low gain", exact: true }).fill("4");
	await expect(eqPanel.getByTestId("eq-low-value")).toHaveText("+4 dB");
	// A band's center moves on a log scale: the top of Mid's travel is its 3 kHz ceiling.
	await eqPanel.getByRole("slider", { name: "Mid center", exact: true }).fill("200");
	await expect(eqPanel.getByTestId("eq-mid-freq")).toHaveText("3.0 kHz");
	await eqPanel.getByRole("checkbox", { name: /High-pass/ }).check();
	await expect(eqButton).toHaveAttribute("data-active", "true");
	await expect(eqPanel.getByTestId("eq-status")).toHaveText("Your EQ for this session");
	// Download with EQ: the server encodes the recording through ffmpeg with the same settings.
	const downloading = page.waitForEvent("download");
	await eqPanel.getByRole("button", { name: "Download with EQ" }).click();
	const download = await downloading;
	expect(download.suggestedFilename()).toMatch(/ \(EQ\)\.mp3$/);
	const eqFile = await download.path();
	expect((await fs.stat(eqFile)).size).toBeGreaterThan(10_000);
	await eqPanel.getByRole("button", { name: "Close", exact: true }).click();
	// Still playing through the graph: the clock moves on after the change.
	await page.getByRole("button", { name: "Play", exact: true }).click();
	const t0 = await page
		.locator("audio[crossorigin]")
		.evaluate((a) => (a as HTMLAudioElement).currentTime);
	await page.waitForTimeout(1500);
	const t1 = await page
		.locator("audio[crossorigin]")
		.evaluate((a) => (a as HTMLAudioElement).currentTime);
	expect(t1).toBeGreaterThan(t0);
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	// Remembered per session on the device, under the session's own key.
	const sessionId = await sessions.first().getAttribute("data-session");
	const stored = await page.evaluate(
		(key) => JSON.parse(localStorage.getItem(key) ?? "null"),
		`stem-shovel:session-eq:${sessionId}`,
	);
	expect(stored).toMatchObject({
		highPass: true,
		low: { gain: 4, freq: 200 },
		mid: { gain: 0, freq: 3000 },
	});
	// A reload keeps it; Reset lets it go. After the reload nothing plays and the player's panel is
	// hidden until a row is played, so the first recording is started to bring it back.
	// (networkidle: a click before the dev server's modules have hydrated the page is lost.)
	await page.reload({ waitUntil: "networkidle" });
	await page
		.locator("[data-recording]")
		.first()
		.getByRole("button", { name: /^Play / })
		.click();
	await expect(player).toBeVisible();
	await expect(player.getByRole("button", { name: "EQ", exact: true })).toHaveAttribute(
		"data-active",
		"true",
	);
	await player.getByRole("button", { name: "EQ", exact: true }).click();
	// Save for everyone: the session row keeps it, so Reset falls back to the shared EQ rather than flat,
	// and Remove shared EQ lets it go.
	await page.getByRole("button", { name: "Save for everyone" }).click();
	await expect(page.getByText("EQ saved for everyone in the account")).toBeVisible();
	await expect(eqPanel.getByTestId("eq-status")).toHaveText("The session's shared EQ");
	await page.getByRole("button", { name: "Reset" }).click();
	await expect(player.getByRole("button", { name: "EQ", exact: true })).toHaveAttribute(
		"data-active",
		"true",
	);
	await page.getByRole("button", { name: "Remove shared EQ" }).click();
	await expect(page.getByText("Shared EQ removed")).toBeVisible();
	await expect(eqPanel.getByTestId("eq-status")).toHaveText("Flat");
	await expect(player.getByRole("button", { name: "EQ", exact: true })).toHaveAttribute(
		"data-active",
		"false",
	);
	await page.getByRole("button", { name: "Close", exact: true }).click();

	// The player floats: closing its panel keeps the recording playing and lights the toolbar's Player
	// button, which brings the panel back.
	await page.getByRole("button", { name: "Close Player" }).click();
	await expect(player).toBeHidden();
	const playerButton = page.getByRole("button", { name: "Player", exact: true });
	await expect(playerButton).toHaveAttribute("data-active", "true");
	const c0 = await page
		.locator("audio[crossorigin]")
		.evaluate((a) => (a as HTMLAudioElement).currentTime);
	await page.waitForTimeout(1200);
	expect(
		await page.locator("audio[crossorigin]").evaluate((a) => (a as HTMLAudioElement).currentTime),
	).toBeGreaterThan(c0);
	await playerButton.click();
	await expect(player).toBeVisible();
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
	await second.getByLabel("Input device").selectOption("");
	await second.getByLabel("Input name").fill("Room mic");
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

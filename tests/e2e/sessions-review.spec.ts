import { expect, open, test } from "./fixtures";

/**
 * The Sessions page's review (docs/uploads-and-blob.md, "Sessions" review)
 * as the bot: a WAV uploaded as a practice gets an MP3 and a measured
 * waveform; a comment is left at a spot from the waveform's menu, shows as
 * a bubble and in the list, is edited, then deleted; the session's chat
 * takes a message; the search narrows the list; the session is deleted at
 * the end.
 */
const PAGE = process.env.E2E_SESSIONS ?? "/mmkk/sessions";
const STAMP = `e2e ${Date.now()}`;

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

test("comments on a recording's waveform, chats about the session, and searches", async ({
	page,
	errors,
}) => {
	test.setTimeout(300_000);
	await open(page, PAGE);
	await deleteEverySession(page);
	await page.getByRole("button", { name: "Practice", exact: true }).first().click();
	await page.getByLabel("Place").fill("The Garage");
	await page.locator('input[type="file"]').setInputFiles(["static/stems/keys.wav"]);
	const row = page.locator("[data-recording]").first();
	await expect(row).toBeVisible({ timeout: 180_000 });
	const session = page.locator("[data-session]").first();

	// The review row opens from the comments button; the waveform arrives once the jobs function measured it.
	await row.getByRole("button", { name: /^Comments on keys/ }).click();
	const review = row.locator("[data-recording-review]");
	await expect(review).toBeVisible();
	await expect(review.getByText(/waveform is on its way/)).toHaveCount(0, { timeout: 240_000 });
	await expect(page.getByText("MP3 rendering…")).toHaveCount(0);

	// A comment at a spot: right-click the waveform, Comment here, the position filled in.
	await review
		.getByRole("slider", { name: "Mix position" })
		.click({ button: "right", position: { x: 60, y: 10 } });
	await page.getByRole("menuitem", { name: "Comment here" }).click();
	const popover = page.locator("#recording-comment");
	await expect(popover).toBeVisible();
	await expect(popover.getByRole("heading")).toContainText("on keys");
	const position = await popover.getByPlaceholder("1:23.4").inputValue();
	expect(position).toMatch(/^\d+:\d\d\.\d\d$/);
	await popover.getByLabel("Title").fill(`${STAMP} tempo`);
	await popover.getByLabel("Comment", { exact: true }).fill("Drags after the bridge");
	await popover.getByRole("button", { name: "Post comment" }).click();
	await expect(popover).toBeHidden();
	await expect(review.getByRole("button", { name: `Comment: ${STAMP} tempo` })).toBeVisible();
	await expect(row.getByRole("button", { name: /^Comments on keys \(1\)/ })).toBeVisible();
	const card = review.locator("[data-review-comment]").first();
	await expect(card).toContainText("Drags after the bridge");

	// Edited by its author, then deleted.
	await card.getByRole("button", { name: "Edit" }).click();
	await expect(popover.getByRole("heading")).toContainText("Edit comment");
	// The textarea's text joins its label's name once it has some; match the start.
	await popover
		.getByRole("textbox", { name: /^Comment/ })
		.fill("Drags after the bridge, pick it up");
	await popover.getByRole("button", { name: "Save" }).click();
	await expect(card).toContainText("pick it up");
	await expect(card).toContainText("edited");
	page.once("dialog", (d) => d.accept());
	await card.getByRole("button", { name: "Delete" }).click();
	await expect(review.locator("[data-review-comment]")).toHaveCount(0);

	// The session's chat: a message sent with Enter, shown at once; the button carries the count.
	await session.getByRole("button", { name: /^Chat on/ }).click();
	const chat = page.getByRole("dialog", { name: /^Chat ·/ });
	await expect(chat).toBeVisible();
	const box = chat.getByRole("textbox", { name: "Message" });
	await box.fill(`${STAMP} good practice`);
	await box.press("Enter");
	await expect(chat.locator("[data-chat-message]", { hasText: STAMP })).toBeVisible();
	await expect(session.getByRole("button", { name: /^Chat on/ })).toContainText("1");
	await chat.getByRole("button", { name: /^Close Chat/ }).click();

	// The search: the session's place finds it, a recording's title too, nonsense finds nothing.
	const search = page.getByRole("searchbox", { name: "Search sessions" });
	await search.fill("garage");
	await expect(page.locator("[data-session]")).toHaveCount(1);
	await search.fill("keys");
	await expect(page.locator("[data-recording]")).toHaveCount(1);
	await search.fill("zzzz-nothing");
	await expect(page.locator("[data-session]")).toHaveCount(0);
	await expect(page.getByText(/Nothing matches/)).toBeVisible();
	await search.fill("");
	await expect(page.locator("[data-session]")).toHaveCount(1);

	// A loop: a drag across the waveform selects a stretch, Loop plays it round and the playhead stays inside it.
	await row.getByRole("button", { name: "Play keys" }).click();
	await expect(row.getByRole("button", { name: "Pause keys" })).toBeVisible();
	const wave = review.getByRole("slider", { name: "Mix position" });
	const rect = (await wave.boundingBox())!;
	await page.mouse.move(rect.x + rect.width * 0.1, rect.y + rect.height / 2);
	await page.mouse.down();
	await page.mouse.move(rect.x + rect.width * 0.25, rect.y + rect.height / 2, { steps: 8 });
	await page.mouse.up();
	const loopButton = page.locator("[data-session-player]").getByRole("button", { name: "Loop" });
	await loopButton.click();
	await expect(loopButton).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator("[data-session-player]")).toContainText(/loop 0:0\d/);
	await page.waitForTimeout(4000);
	const at = await wave.getAttribute("aria-valuenow");
	expect(Number(at)).toBeLessThan(30);
	await loopButton.click();
	await page.keyboard.press("Escape");
	await row.getByRole("button", { name: "Pause keys" }).click();

	// A viewing link for the recording alone: made from its menu, it opens the recording's own page for a visitor.
	const row2 = page.locator("[data-recording]").first();
	await row2.getByRole("button", { name: /actions$/ }).click();
	await page.getByRole("button", { name: /^Share…/ }).click();
	const sharePopover = page.locator("#recording-share");
	await expect(sharePopover).toBeVisible();
	await sharePopover.getByRole("button", { name: "New link" }).click();
	// Shown as XXXX-XXXX-XXXX (formatInviteCode); the code itself may hold a dash, so the two inserted ones go by position.
	const shown = (await sharePopover.locator("code").first().textContent())?.trim() ?? "";
	const code = shown.slice(0, 4) + shown.slice(5, 9) + shown.slice(10);
	expect(code).toHaveLength(12);
	await sharePopover.getByRole("button", { name: "Close" }).click();
	const visitor = await page.context().browser()!.newContext();
	const guest = await visitor.newPage();
	await guest.goto(`/s/${code}`);
	await expect(guest.locator("[data-recording-title]")).toHaveText("keys");
	await expect(guest.getByRole("button", { name: "Download MP3" })).toBeVisible();
	// Without the code the page is not there.
	const stranger = await visitor.newPage();
	await visitor.clearCookies();
	const res = await stranger.goto(
		page.url().replace(/\/mmkk\/sessions.*$/, "") +
			`/mmkk/sessions/r/${await row2.getAttribute("data-recording")}`,
	);
	expect(res?.status()).toBe(404);
	await visitor.close();

	await deleteEverySession(page);
	await expect(page.locator("[data-session]")).toHaveCount(0);
	expect(errors).toEqual([]);
});

import { expect, open, test } from "./fixtures";

/**
 * The session recorder (docs/uploads-and-blob.md, "The session recorder")
 * as the bot with the fake microphone: Record, Stop, the take plays back,
 * a title and Save land it on the Sessions page as a recording of today's
 * session; the session is deleted at the end.
 */
const ACCOUNT = process.env.E2E_ACCOUNT ?? "/mmkk";
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

test("records the room and saves it as a session recording", async ({ page, errors }) => {
	test.setTimeout(180_000);
	await open(page, `${ACCOUNT}/sessions`);
	await deleteEverySession(page);
	await page.getByRole("link", { name: "Record a session" }).click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Record a session");
	const recorder = page.locator("[data-session-recorder]");
	await recorder.getByRole("button", { name: "Record" }).click();
	await expect(recorder.getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 15_000 });
	await expect(recorder).toContainText(/Recording/);
	await page.waitForTimeout(3000);
	await recorder.getByRole("button", { name: "Stop" }).click();
	await expect(recorder.locator("audio")).toBeVisible();
	await expect(recorder).toContainText(/recorded ·/);
	const title = recorder.getByLabel("Title");
	await expect(title).toHaveValue(/^Practice \d/);
	await title.fill(`${STAMP} take`);
	await recorder.getByLabel("Input source").fill("Room mic");
	await recorder.getByRole("button", { name: "Save to sessions" }).click();
	await expect(page).toHaveURL(/\/sessions/, { timeout: 60_000 });
	const row = page.locator("[data-recording]").first();
	await expect(row).toContainText(`${STAMP} take`, { timeout: 60_000 });
	await expect(row).toContainText("Room mic");
	await deleteEverySession(page);
	expect(errors).toEqual([]);
});

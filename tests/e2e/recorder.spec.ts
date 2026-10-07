import { expect, open, test } from "./fixtures";

/**
 * The Idea Recorder (docs/demo-recording.md) with the fake microphone: a
 * take records, lists under its idea, uploads; then every idea the bot has
 * is deleted through the device's menu, so nothing is left behind.
 */
test("records a take that lists and uploads, then deletes the bot's ideas", async ({
	page,
	errors,
}) => {
	await open(page, "/ideas/recorder", "__inputs");
	const device = page.getByRole("dialog", { name: "Idea Recorder" });
	const list = page.getByRole("dialog", { name: "Recordings" });
	await device.getByRole("button", { name: "Record", exact: true }).click();
	await expect(device.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
	await page.waitForTimeout(3000);
	await device.getByRole("button", { name: "Stop", exact: true }).click();
	// The take lists the moment Stop is pressed, then its upload lands.
	await expect(list.getByText(/Take 1/).first()).toBeVisible();
	await expect(list.getByText(/Saving…|Waiting…/)).toHaveCount(0, { timeout: 60_000 });
	// Every idea in the list: load its first take, then Delete Idea from the device's menu.
	for (let i = 0; i < 10 && (await list.locator("details").count()); i++) {
		const idea = list.locator("details").first();
		// A present boolean attribute reads as "", so the test is against null.
		if ((await idea.getAttribute("open")) === null) await idea.locator("summary").click();
		await idea.locator("li button").first().click();
		page.once("dialog", (d) => d.accept());
		await device.getByRole("button", { name: "More actions" }).click();
		await page.getByRole("button", { name: "Delete Idea" }).click();
		await page.waitForTimeout(1500);
	}
	expect(await list.locator("details").count()).toBe(0);
	expect(errors).toEqual([]);
});

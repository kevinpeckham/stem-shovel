import { expect, open, test } from "./fixtures";

/**
 * Shows and practices (docs/band-plan.md, phase 2) as the bot in its
 * account: a show is put on the calendar from the Shows page, its venue
 * and showtime saved, a set list made and attached as its first set with a
 * label, the Practices page reached from the Manage menu, and the show
 * and the set list deleted at the end.
 */
const SHOWS = process.env.E2E_SHOWS ?? "/mmkk/shows";
const SET_LISTS = "/mmkk/set-lists";
const TITLE = "E2E Show";
const SET = "E2E Show Set";
/** A one-pixel PNG, enough for the signature check and the browser's thumbnail. */
const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	"base64",
);

async function deleteStaleShows(page: import("@playwright/test").Page) {
	await open(page, SHOWS);
	while (await page.getByRole("link", { name: TITLE }).count()) {
		await page.getByRole("link", { name: TITLE }).first().click();
		await page.waitForURL(/\/events\/[^/]+$/);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL(/\/shows$/);
	}
}
async function deleteStaleSets(page: import("@playwright/test").Page) {
	await open(page, SET_LISTS);
	const list = page.getByRole("list", { name: "Set lists" });
	while (await list.getByText(SET).count()) {
		await list.getByText(SET).first().click();
		await page.waitForURL(/\/set-lists\/[^/]+$/);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL(/\/set-lists$/);
	}
}

test("puts a show on the calendar, attaches a set and deletes it", async ({ page, errors }) => {
	test.setTimeout(120_000);
	page.on("dialog", (d) => void d.accept());
	await deleteStaleShows(page);
	await deleteStaleSets(page);

	// A set list to attach.
	await page.getByRole("button", { name: "New set list" }).click();
	await page.getByLabel("Title").fill(SET);
	await page.getByRole("button", { name: "Create" }).click();
	await page.waitForURL(/\/set-lists\/[^/]+$/);
	await page.getByLabel("Add a line").fill("Opener");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByLabel("Row 1 title")).toHaveValue("Opener");

	// The show, from the Shows page.
	await open(page, SHOWS);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Shows");
	await page.getByRole("button", { name: "New show" }).click();
	await page.getByLabel("Title").fill(TITLE);
	await page.getByLabel("Venue").fill("The Echo");
	await page.getByRole("button", { name: "Create" }).click();
	await page.waitForURL(/\/events\/[^/]+$/);
	await expect(page.getByLabel("Title")).toHaveValue(TITLE);
	await page.getByLabel("Showtime").fill("20:30");
	await page.getByLabel("City").fill("Los Angeles");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Show saved")).toBeVisible();
	await expect(page.getByRole("link", { name: /Directions/ })).toHaveAttribute(
		"href",
		/The%20Echo/,
	);

	// The set, attached and labeled.
	// Choosing a set list attaches it at once (no button, Kevin 2026-10-28).
	await page.getByLabel("Attach a set list").selectOption({ label: `${SET} · 1 row` });
	const sets = page.getByRole("list", { name: "Set lists" });
	await expect(sets.getByRole("listitem")).toHaveCount(1);
	await expect(sets.getByRole("link", { name: SET })).toBeVisible();
	await page.getByLabel("Label of set 1").fill("Set 1");
	await page.getByLabel("Label of set 1").press("Tab");
	await page.reload({ waitUntil: "networkidle" });
	await expect(page.getByLabel("Label of set 1")).toHaveValue("Set 1");

	// The poster (a one-pixel PNG) and a photo with a caption (Kevin, 2026-10-28).
	await page.getByLabel("Upload a poster").setInputFiles({
		name: "poster.png",
		mimeType: "image/png",
		buffer: PNG,
	});
	await expect(page.getByText("Poster uploaded")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole("img", { name: `Poster for ${TITLE}` })).toBeVisible();
	await page.getByRole("button", { name: "Poster actions" }).click();
	await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute(
		"href",
		/\/f\/[^/?]+\?download=1/,
	);
	await page.keyboard.press("Escape");
	await page.getByLabel("Add photos").setInputFiles({
		name: "night.png",
		mimeType: "image/png",
		buffer: PNG,
	});
	const photos = page.getByRole("list", { name: "Photos" });
	await expect(photos.getByRole("listitem")).toHaveCount(1, { timeout: 30_000 });
	await page.getByRole("button", { name: "Open photo 1" }).click();
	const lightbox = page.getByRole("dialog", { name: "Photo" });
	await expect(lightbox).toBeVisible();
	await lightbox.getByLabel("Caption").fill("Soundcheck");
	await lightbox.getByLabel("Caption").press("Tab");
	await expect(page.getByText("Caption saved")).toBeVisible();
	await lightbox.getByRole("button", { name: "Close" }).click();
	await page.reload({ waitUntil: "networkidle" });
	await page.getByRole("button", { name: "Open photo 1" }).click();
	await expect(page.getByRole("dialog", { name: "Photo" }).getByLabel("Caption")).toHaveValue(
		"Soundcheck",
	);
	await page.getByRole("dialog", { name: "Photo" }).getByRole("button", { name: "Close" }).click();

	// The list page shows it under its day, time, venue and set count, with the poster; the Practices page is empty.
	const event = page.url();
	await open(page, SHOWS);
	const upcoming = page.getByRole("list", { name: "Upcoming shows" });
	await expect(upcoming.getByRole("link", { name: TITLE })).toBeVisible();
	await expect(upcoming.getByRole("link", { name: TITLE }).locator("img")).toHaveCount(1);
	await expect(upcoming).toContainText("20:30 · The Echo, Los Angeles · 1 set");
	await page.getByRole("button", { name: "Manage" }).click();
	await page.getByRole("menuitem", { name: "Practices" }).click();
	await page.waitForURL(/\/practices$/);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Practices");
	await expect(page.getByText("No practices yet.")).toBeVisible();

	// Gone: the poster, the show (its photo with it), then the set list.
	await page.goto(event, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: "Poster actions" }).click();
	await page.getByRole("button", { name: "Remove", exact: true }).click();
	await expect(page.getByText("Poster removed")).toBeVisible();
	await expect(page.getByLabel("Upload a poster")).toBeAttached();
	await page.getByRole("button", { name: "Delete" }).click();
	await page.waitForURL(/\/shows$/);
	await expect(page.getByRole("link", { name: TITLE })).toHaveCount(0);
	await deleteStaleSets(page);
	await expect(page.getByText(SET)).toHaveCount(0);
	expect(errors).toEqual([]);
});

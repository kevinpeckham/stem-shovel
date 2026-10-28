import { expect, open, test } from "./fixtures";

/**
 * Shows and practices (docs/band-plan.md, phase 2) as the bot in its
 * account: a show is put on the calendar from the Shows page, its venue
 * and showtime saved, a set list made and attached as its first set with a
 * label, the Practices page reached from the Manage menu, and the show
 * and the set list deleted at the end. The venue is a shared object
 * (Kevin, 2026-10-28): found or added from the New show popover, its
 * notes and contact saved on its page, the Shows page filtered by it, and
 * removed from the account at the end (the place stays on the site).
 */
const SHOWS = process.env.E2E_SHOWS ?? "/mmkk/shows";
const SET_LISTS = "/mmkk/set-lists";
const VENUES = "/mmkk/venues";
const PRACTICES = "/mmkk/practices";
const LOCATIONS = "/mmkk/practice-locations";
const PRACTICE = "E2E Practice";
const LOCATION = "E2E Garage";
const TITLE = "E2E Show";
const SET = "E2E Show Set";
const VENUE = "E2E Echo";
const CITY = "Los Angeles";
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
/** Unlinks the venue from the account (after its shows are gone); the shared venue itself stays. */
async function removeVenue(page: import("@playwright/test").Page) {
	await open(page, VENUES);
	const list = page.getByRole("list", { name: "Venues" });
	while (await list.getByRole("link", { name: VENUE }).count()) {
		await list.getByRole("link", { name: VENUE }).first().click();
		await page.waitForURL(/\/venues\/[^/]+$/);
		const remove = page.getByRole("button", { name: "Remove from this account" });
		// Still in use (a show from another test): leave it.
		if (!(await remove.count())) return;
		await remove.click();
		await page.waitForURL(/\/venues$/);
	}
}
/** Picks the venue in the picker: found on the site when an earlier run made it, else created. */
async function pickVenue(page: import("@playwright/test").Page) {
	await page.getByRole("combobox", { name: "Venue", exact: true }).selectOption({
		label: "Find or add a venue…",
	});
	await page.getByLabel("Search venues").fill(VENUE);
	const found = page.getByRole("list", { name: "Venues found" }).getByRole("button", {
		name: `${VENUE} · ${CITY}`,
	});
	const none = page.getByText(`No venue matches "${VENUE}".`);
	await expect(found.or(none)).toBeVisible();
	if (await found.count()) {
		await found.click();
	} else {
		await page.getByRole("button", { name: "New venue" }).click();
		const form = page.getByRole("group", { name: "New venue" });
		await expect(form.getByLabel("Name")).toHaveValue(VENUE);
		await form.getByLabel("City").fill(CITY);
		await form.getByRole("button", { name: "Create" }).click();
	}
	await expect(page.getByText("Venue added")).toBeVisible();
	await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toContainText(
		`${VENUE} · ${CITY}`,
	);
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
	await removeVenue(page);
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
	await pickVenue(page);
	await page.getByRole("button", { name: "Create" }).click();
	await page.waitForURL(/\/events\/[^/]+$/);
	await expect(page.getByLabel("Title")).toHaveValue(TITLE);
	await page.getByLabel("Showtime").fill("20:30");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Show saved")).toBeVisible();
	const details = page.getByRole("group", { name: "Venue details" });
	await expect(details.getByRole("link", { name: /Directions/ })).toHaveAttribute(
		"href",
		/E2E%20Echo/,
	);

	// The venue's page: the account's notes and contact, and the show listed there (Kevin, 2026-10-28).
	await details.getByRole("link", { name: "Edit venue" }).click();
	await page.waitForURL(/\/venues\/[^/]+$/);
	await expect(page.getByRole("heading", { level: 1 })).toContainText(VENUE);
	await page.getByRole("textbox", { name: "Contact", exact: true }).fill("Sam, 555-0100");
	await page
		.getByRole("textbox", { name: "Your notes", exact: true })
		.fill("Load in through the alley.");
	await page
		.locator("section", { has: page.getByRole("heading", { name: "Your notes and contact" }) })
		.getByRole("button", { name: "Save" })
		.click();
	await expect(page.getByText("Notes saved")).toBeVisible();
	await expect(page.getByRole("link", { name: TITLE })).toBeVisible();
	await expect(page.getByText(/In use by 1 show/)).toBeVisible();
	await page.getByRole("link", { name: "All shows here" }).click();
	await page.waitForURL(/\/shows\?venue=/);
	await expect(page.getByRole("combobox", { name: "Filter by venue" })).toContainText(VENUE);
	await expect(page.getByRole("link", { name: TITLE })).toBeVisible();
	await page.getByRole("link", { name: TITLE }).click();
	await page.waitForURL(/\/events\/[^/]+$/);
	await expect(page.getByText("Contact: Sam, 555-0100")).toBeVisible();
	await expect(page.getByText("Load in through the alley.")).toBeVisible();

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
	await expect(upcoming).toContainText(`20:30 · ${VENUE}, ${CITY} · 1 set`);
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
	await removeVenue(page);
	await expect(page.getByText("No venues yet.")).toBeVisible();
	await deleteStaleSets(page);
	await expect(page.getByText(SET)).toHaveCount(0);
	expect(errors).toEqual([]);
});

/** Deletes leftover E2E practices, then the E2E location (deletable once no practice uses it). */
async function deleteStalePractices(page: import("@playwright/test").Page) {
	await open(page, PRACTICES);
	while (await page.getByRole("link", { name: PRACTICE }).count()) {
		await page.getByRole("link", { name: PRACTICE }).first().click();
		await page.waitForURL(/\/events\/[^/]+$/);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL(/\/practices$/);
	}
	await open(page, LOCATIONS);
	const list = page.getByRole("list", { name: "Practice locations" });
	while (await list.getByRole("link", { name: LOCATION }).count()) {
		await list.getByRole("link", { name: LOCATION }).first().click();
		await page.waitForURL(/\/practice-locations\/[^/]+$/);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL(/\/practice-locations$/);
	}
}

test("puts a practice on the calendar at a saved location and deletes both", async ({
	page,
	errors,
}) => {
	test.setTimeout(120_000);
	page.on("dialog", (d) => void d.accept());
	await deleteStalePractices(page);

	// The practice, with a new location made from the picker (Kevin, 2026-10-28: practices have locations, not venues).
	await open(page, PRACTICES);
	await page.getByRole("button", { name: "New practice" }).click();
	await page.getByLabel("Title").fill(PRACTICE);
	await page.getByRole("combobox", { name: "Location", exact: true }).selectOption({
		label: "New location…",
	});
	const form = page.getByRole("dialog", { name: "New location" });
	await form.getByRole("textbox", { name: "Name", exact: true }).fill(LOCATION);
	await form.getByRole("textbox", { name: "Address", exact: true }).fill("12 Alley Way");
	await form.getByRole("button", { name: "Create" }).click();
	await expect(page.getByText("Location added")).toBeVisible();
	await expect(page.getByRole("combobox", { name: "Location", exact: true })).toContainText(
		LOCATION,
	);
	await page.getByRole("button", { name: "Create" }).click();
	await page.waitForURL(/\/events\/[^/]+$/);
	await expect(page.getByLabel("Title")).toHaveValue(PRACTICE);
	await expect(page.getByText("12 Alley Way")).toBeVisible();
	await expect(page.getByRole("combobox", { name: "Venue", exact: true })).toHaveCount(0);

	// Its location page lists it, and the Practices page filters by it.
	await page.getByRole("link", { name: "Edit location" }).click();
	await page.waitForURL(/\/practice-locations\/[^/]+$/);
	await expect(page.getByRole("heading", { level: 1 })).toContainText(LOCATION);
	await expect(page.getByRole("link", { name: PRACTICE })).toBeVisible();
	await expect(page.getByText(/In use by 1 practice/)).toBeVisible();
	await page.getByRole("link", { name: "All practices here" }).click();
	await page.waitForURL(/\/practices\?location=/);
	await expect(page.getByRole("combobox", { name: "Filter by location" })).toContainText(LOCATION);
	await expect(page.getByRole("link", { name: PRACTICE })).toBeVisible();

	// Gone: the practice, then the location.
	await page.getByRole("link", { name: PRACTICE }).click();
	await page.waitForURL(/\/events\/[^/]+$/);
	await page.getByRole("button", { name: "Delete" }).click();
	await page.waitForURL(/\/practices$/);
	await open(page, LOCATIONS);
	await page
		.getByRole("list", { name: "Practice locations" })
		.getByRole("link", { name: LOCATION })
		.click();
	await page.waitForURL(/\/practice-locations\/[^/]+$/);
	await page.getByRole("button", { name: "Delete" }).click();
	await page.waitForURL(/\/practice-locations$/);
	await expect(page.getByText("No locations yet.")).toBeVisible();
	expect(errors).toEqual([]);
});

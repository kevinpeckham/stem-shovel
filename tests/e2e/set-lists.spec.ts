import { expect, open, test } from "./fixtures";

/**
 * Set lists (docs/band-plan.md, phase 1) as the bot in its account: a set
 * list is made, a song and a free-text line added, a note written, the
 * line moved up and the order kept across a reload, a pasted list added
 * (one line matched to a song, one kept as text), a song row given its
 * own title, the show view opened,
 * the set list pinned and unpinned on the dashboard, and the set list
 * deleted at the end.
 */
const PAGE = process.env.E2E_SET_LISTS ?? "/mmkk/set-lists";
const TITLE = "E2E Set List";

async function deleteStale(page: import("@playwright/test").Page) {
	await open(page, PAGE);
	while (await page.getByRole("list", { name: "Set lists" }).getByText(TITLE).count()) {
		await page.getByRole("list", { name: "Set lists" }).getByText(TITLE).first().click();
		await page.waitForURL(/\/set-lists\/[^/]+$/);
		await page.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL(/\/set-lists$/);
	}
}

test("writes, orders, shows and deletes a set list", async ({ page, errors }) => {
	test.setTimeout(120_000);
	// Every confirm on the page (the delete's) is accepted.
	page.on("dialog", (d) => void d.accept());
	await deleteStale(page);

	await page.getByRole("button", { name: "New set list" }).click();
	await page.getByLabel("Title").fill(TITLE);
	await page.getByRole("button", { name: "Create" }).click();
	await page.waitForURL(/\/set-lists\/[^/]+$/);
	// The editor's title is the heading-sized field itself.
	await expect(page.getByLabel("Title")).toHaveValue(TITLE);

	// A song from the catalog, picked from the matches, and a free-text line.
	await page.getByLabel("Add a song").fill("Eat All the");
	await page
		.getByRole("list", { name: "Matching songs" })
		.getByRole("button", { name: /Eat All the Clocks/ })
		.click();
	const rows = page.getByRole("list", { name: "Rows of the set list" });
	await expect(rows.getByRole("listitem")).toHaveCount(1);
	await expect(rows).toContainText("Eat All the Clocks");
	await page.getByLabel("Add a line").fill("Break");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(rows.getByRole("listitem")).toHaveCount(2);

	// A note saves on change; the line moves up and the order survives a reload.
	await page.getByLabel("Row 1 note").fill("Key of D");
	await page.getByLabel("Row 1 note").press("Tab");
	await page.getByRole("button", { name: "Move Break up" }).click();
	// A free-text row's title is its own field; a song row shows the song's link.
	await expect(page.getByLabel("Row 1 title")).toHaveValue("Break");
	await expect(page.getByText("Order saved")).toBeVisible();
	await page.reload();
	await expect(page.getByLabel("Row 1 title")).toHaveValue("Break");
	await expect(rows.getByRole("listitem").nth(1)).toContainText("Eat All the Clocks");
	await expect(page.getByLabel("Row 2 note")).toHaveValue("Key of D");

	// A pasted list: numbering dropped, "Interbellum" matched to the song, the cover kept as text.
	await page.getByRole("button", { name: "Paste a list" }).click();
	await page.getByLabel("Songs, one per line").fill("1. Interbellum\n2. Wagon Wheel\n\n");
	await page.getByRole("button", { name: "Add rows" }).click();
	await expect(rows.getByRole("listitem")).toHaveCount(4);
	await expect(rows.getByRole("listitem").nth(2)).toContainText("Interbellum");
	await expect(page.getByLabel("Row 4 title")).toHaveValue("Wagon Wheel");

	// A song row's own title: typed over the song's (shown as the placeholder), kept across a reload, the song still named under it.
	await expect(page.getByLabel("Row 3 title")).toHaveAttribute("placeholder", "Interbellum");
	await page.getByLabel("Row 3 title").fill("Interbellum (acoustic)");
	await page.getByLabel("Row 3 title").press("Tab");
	await page.reload();
	await expect(page.getByLabel("Row 3 title")).toHaveValue("Interbellum (acoustic)");
	await expect(
		rows.getByRole("listitem").nth(2).getByRole("link", { name: "Interbellum" }),
	).toBeVisible();

	// The show view lists the set in order.
	const editor = page.url();
	await page.getByRole("link", { name: "Show view" }).click();
	await page.waitForURL(/\/show$/);
	await expect(page.getByRole("heading", { level: 1 })).toContainText(TITLE);
	const set = page.getByRole("list", { name: "The set" });
	await expect(set.getByRole("listitem")).toHaveCount(4);
	await expect(set.getByRole("listitem").first()).toContainText("Break");
	await expect(set.getByRole("listitem").nth(1)).toContainText("Key of D");
	await expect(set.getByRole("listitem").nth(2)).toContainText("Interbellum (acoustic)");
	await expect(set.getByRole("listitem").nth(3)).toContainText("Wagon Wheel");

	// On the dashboard the set list is in Your Set Lists, and its pin puts it in Pinned.
	await open(page, "/dashboard");
	const setListsRegion = page.getByRole("region", { name: "Your Set Lists" });
	await expect(setListsRegion.getByRole("link", { name: TITLE })).toBeVisible();
	await setListsRegion.getByRole("button", { name: `Pin ${TITLE}` }).click();
	const pinnedRegion = page.getByRole("region", { name: "Pinned" });
	await expect(pinnedRegion.getByRole("link", { name: TITLE })).toBeVisible();
	await pinnedRegion.getByRole("button", { name: `Unpin ${TITLE}` }).click();
	await expect(setListsRegion.getByRole("button", { name: `Pin ${TITLE}` })).toBeVisible();

	// (networkidle: a click before the dev server's modules have hydrated the page is lost.)
	await page.goto(editor, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: "Delete" }).click();
	await page.waitForURL(/\/set-lists$/);
	await expect(page.getByText(TITLE)).toHaveCount(0);
	expect(errors).toEqual([]);
});

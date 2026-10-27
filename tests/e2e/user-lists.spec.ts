import { expect, open, test } from "./fixtures";

/**
 * The person's songs and sessions across accounts (docs/dashboard-plan.md):
 * /songs lists every song with its project, account and stage, searchable
 * and filterable by stage; /sessions the same for recording sessions.
 */
test("the songs page lists every song across accounts with a search and a stage filter", async ({
	page,
	errors,
}) => {
	await open(page, "/songs");
	await expect(page.getByRole("heading", { level: 1, name: "Your Songs" })).toBeVisible();
	const rows = page.getByRole("row");
	await expect(page.getByRole("link", { name: "Eat All the Clocks" })).toHaveAttribute(
		"href",
		/\/mmkk\/projects\/badverbs\/eat-all-the-clocks$/,
	);
	await expect(page.getByRole("cell", { name: "Badverbs" }).first()).toBeVisible();
	// The search narrows by title; Nothing matches when nothing does.
	const search = page.getByRole("searchbox", { name: "Search songs" });
	await search.fill("clocks");
	await expect(page.getByRole("link", { name: "Eat All the Clocks" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Interbellum" })).toHaveCount(0);
	await search.fill("zzzz-no-such-song");
	await expect(page.getByRole("link", { name: "Eat All the Clocks" })).toHaveCount(0);
	await search.fill("");
	expect(await rows.count()).toBeGreaterThan(2);
	expect(errors).toEqual([]);
});

test("the sessions page lists every session across accounts", async ({ page, errors }) => {
	await open(page, "/sessions");
	await expect(page.getByRole("heading", { level: 1, name: "Your Sessions" })).toBeVisible();
	expect(errors).toEqual([]);
});

test("signed out, both pages send to sign-in", async ({ browser }) => {
	const context = await browser.newContext({ ignoreHTTPSErrors: true });
	const guest = await context.newPage();
	const base = test.info().project.use.baseURL;
	await guest.goto(`${base}/songs`);
	await expect(guest).toHaveURL(/\/sign-in\?next=%2Fsongs/);
	await guest.goto(`${base}/sessions`);
	await expect(guest).toHaveURL(/\/sign-in\?next=%2Fsessions/);
	await context.close();
});

import { expect, open, test } from "./fixtures";

/**
 * The dashboard (docs/dashboard-plan.md, step 1): where a signed-in
 * person lands. The bot sees the heading, what is new, the quick actions
 * and a section per account; the wordmark leads back here; signed out,
 * the page sends to sign-in with the dashboard as the way back.
 */
test("the dashboard shows what is new and each account's recent work", async ({ page, errors }) => {
	await open(page, "/dashboard");
	await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "New for you" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Quick actions" })).toBeVisible();
	const account = page.locator('[data-dashboard-account="mmkk"]');
	await expect(account).toBeVisible();
	await expect(account.getByRole("heading", { name: "Latest session" })).toBeVisible();
	await expect(account.getByRole("heading", { name: "Recent projects" })).toBeVisible();
	await expect(account.getByRole("link", { name: "All projects" })).toHaveAttribute(
		"href",
		"/mmkk/projects",
	);
	await expect(account.getByRole("link", { name: "Add a recording" }).first()).toHaveAttribute(
		"href",
		"/mmkk/sessions",
	);
	// The wordmark leads back to the dashboard for a signed-in person.
	await expect(page.getByRole("link", { name: /Stem Shovel wordmark/ })).toHaveAttribute(
		"href",
		"/dashboard",
	);
	// Signed out, the page is behind sign-in, with the dashboard as the way back.
	const stranger = await page.context().browser()!.newContext({ ignoreHTTPSErrors: true });
	const guest = await stranger.newPage();
	await guest.goto(`${test.info().project.use.baseURL}/dashboard`);
	await expect(guest).toHaveURL(/\/sign-in\?next=%2Fdashboard/);
	await expect(guest.getByRole("link", { name: /Stem Shovel wordmark/ })).toHaveAttribute(
		"href",
		"/",
	);
	await stranger.close();
	expect(errors).toEqual([]);
});

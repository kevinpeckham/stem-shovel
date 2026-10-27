import { expect, open, test } from "./fixtures";

/**
 * The dashboard (docs/dashboard-plan.md, step 1): where a signed-in
 * person lands. The bot sees the heading, what is new, the quick actions
 * and a section per account; the wordmark leads back here; signed out,
 * the page sends to sign-in with the dashboard as the way back.
 */
test("the dashboard shows what is new and each account's recent work", async ({ page, errors }) => {
	await open(page, "/dashboard");
	await expect(page.getByRole("heading", { level: 1, name: "User Dashboard" })).toBeVisible();
	// The account tile: projects, songs and sessions to jump to.
	const account = page.locator('[data-dashboard-account="mmkk"]');
	await expect(account).toBeVisible();
	for (const list of ["Projects", "Songs", "Sessions"])
		await expect(account.getByRole("heading", { name: list })).toBeVisible();
	await expect(account.getByRole("link", { name: "All projects" })).toHaveAttribute(
		"href",
		"/mmkk/projects",
	);
	await expect(account.getByRole("link", { name: "All sessions" })).toHaveAttribute(
		"href",
		"/mmkk/sessions",
	);
	// The person's own work, each with a way to start when empty.
	for (const name of [
		"Your Projects & Songs",
		"Your Songs",
		"Your Ideas",
		"Your Multitrack Recordings",
		"Your Loops",
	])
		await expect(page.getByRole("heading", { name })).toBeVisible();
	// Your Songs: each song under its project.
	await expect(page.getByRole("list", { name: "Your Songs" })).toContainText("Badverbs");
	// The sidebar: what is new, then the tools, instruments and more.
	const sidebar = page.getByRole("complementary", { name: "Dashboard sidebar" });
	await expect(sidebar.getByRole("heading", { name: "Latest" })).toBeVisible();
	await expect(sidebar.getByRole("link", { name: "Whirl Looper" })).toHaveAttribute(
		"href",
		"/looper",
	);
	await expect(sidebar.getByRole("link", { name: "Session Recorder" })).toHaveAttribute(
		"href",
		/\/sessions\/record$/,
	);
	await expect(sidebar.getByRole("link", { name: "Piano" })).toHaveAttribute("href", "/piano");
	await expect(sidebar.getByRole("button", { name: "Report a bug" })).toBeVisible();
	await expect(sidebar.getByRole("button", { name: "Share Stem Shovel" })).toBeVisible();
	await expect(sidebar.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
	await expect(sidebar.getByRole("link", { name: "Account settings" })).toHaveAttribute(
		"href",
		"/mmkk/settings",
	);
	await expect(sidebar.getByRole("link", { name: "Stem Shovel Blog" })).toHaveAttribute(
		"href",
		"/blog",
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

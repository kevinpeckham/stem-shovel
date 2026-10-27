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
	// The account tile: the person's role and the counts, each a link.
	const account = page.locator('[data-dashboard-account="mmkk"]');
	await expect(account).toBeVisible();
	await expect(account.getByTitle("Your role in MMKK")).toHaveText(/Owner|Admin|Member/);
	await expect(account.getByRole("link", { name: /^\d+ projects?$/ })).toHaveAttribute(
		"href",
		"/mmkk/projects",
	);
	await expect(account.getByRole("link", { name: /^\d+ sessions?$/ })).toHaveAttribute(
		"href",
		"/mmkk/sessions",
	);
	await expect(account.getByRole("link", { name: /^\d+ members?$/ })).toHaveAttribute(
		"href",
		"/mmkk/settings",
	);
	await expect(account.getByRole("link", { name: "Go to account page" })).toHaveAttribute(
		"href",
		"/mmkk/projects",
	);
	// The person's own work, each with a way to start when empty.
	for (const name of [
		"Your Accounts",
		"Your Projects",
		"Your Songs",
		"Your Sessions",
		"Your Ideas",
		"Your Multitrack Recordings",
		"Your Loops",
	])
		await expect(page.getByRole("heading", { name })).toBeVisible();
	// Each section heading carries an info button explaining the kind of thing it lists.
	await page.getByRole("button", { name: "About Your Sessions" }).click();
	await expect(page.getByRole("note")).toContainText("live recordings of shows or practices");
	await page.keyboard.press("Escape");
	// Your Projects: each with its song count; All projects opens the page across accounts.
	await expect(page.getByRole("list", { name: "Your Projects" })).toContainText(/\d+ songs?/);
	await expect(
		page.getByRole("region", { name: "Your Projects" }).getByRole("link", { name: "All projects" }),
	).toHaveAttribute("href", "/projects");
	// Your Songs: each song under its project.
	const songs = page.getByRole("list", { name: "Your Songs" });
	await expect(songs).toContainText("Badverbs");
	// … with its stage and counts of stems and demos.
	await expect(songs).toContainText(/Writing|Arranging|Mixing|Finished/);
	await expect(songs).toContainText(/\d+ stems?/);
	await expect(songs).toContainText(/\d+ demos?/);
	await expect(
		page.getByRole("region", { name: "Your Songs" }).getByRole("link", { name: "All songs" }),
	).toHaveAttribute("href", "/songs");
	// Your Sessions: the bot's accounts hold none, so the card offers to record one.
	await expect(page.getByRole("link", { name: "Record a session" })).toHaveAttribute(
		"href",
		/\/sessions\/record$/,
	);
	// Latest (what is new) is its own aside, first on a phone; then the sidebar: tools, instruments and more.
	await expect(
		page.getByRole("complementary", { name: "Latest" }).getByRole("heading", { name: "Latest" }),
	).toBeVisible();
	// Conversations: the chats with new messages and the comments waiting, or "Nothing waiting."
	const conversations = page.getByRole("region", { name: "Conversations" });
	await expect(conversations).toBeVisible();
	await expect(conversations).toContainText(/with new messages|waiting/);
	const sidebar = page.getByRole("complementary", { name: "Dashboard sidebar" });
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

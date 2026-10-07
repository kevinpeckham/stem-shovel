import { expect, hooked, open, test, until } from "./fixtures";

/**
 * The instruments' transports through their pages (docs/drum-machine.md,
 * docs/piano.md, the metronome): each starts and stops from its own button
 * and says so through its engine.
 */
test("the drum machine plays and stops", async ({ page, errors }) => {
	await open(page, "/drum-machine", "__drums");
	await page.getByRole("button", { name: "Play", exact: true }).first().click();
	await until(page, ([w]) => w.__drums.running === true);
	await page.getByRole("button", { name: "Stop", exact: true }).first().click();
	await until(page, ([w]) => w.__drums.running === false);
	expect(errors).toEqual([]);
});

test("the metronome starts and stops", async ({ page, errors }) => {
	// The metronome page has no dev hook: the button's own state says what the engine does.
	await open(page, "/metronome");
	await page.getByRole("button", { name: "Start", exact: true }).first().click();
	await expect(page.getByRole("button", { name: "Stop", exact: true }).first()).toBeVisible();
	await page.getByRole("button", { name: "Stop", exact: true }).first().click();
	await expect(page.getByRole("button", { name: "Start", exact: true }).first()).toBeVisible();
	expect(errors).toEqual([]);
});

test("the piano sounds a note and lets it go", async ({ page, errors }) => {
	await open(page, "/piano", "__piano");
	await page.mouse.click(700, 300);
	await hooked(page, ([w]) => w.__piano.noteOn(60, 0.8));
	await until(page, ([w]) => w.__piano.sounding.includes(60));
	await hooked(page, ([w]) => w.__piano.noteOff(60));
	await until(page, ([w]) => !w.__piano.sounding.includes(60));
	expect(errors).toEqual([]);
});

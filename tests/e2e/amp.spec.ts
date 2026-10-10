import { expect, hooked, open, test, until } from "./fixtures";

/**
 * The Practice Amp (docs/practice-amp.md) with the fake microphone: the
 * switch opens the input and the meters move; the chain renders a test
 * tone offline through each head without blowing up or going silent;
 * off closes the input.
 */
test("the amp turns on, hears the input, renders through every head, and turns off", async ({
	page,
	errors,
}) => {
	await open(page, "/practice-amp", "__amp");
	const device = page.getByRole("group", { name: "Head" });
	await expect(device).toBeVisible();
	await page.getByRole("button", { name: "Turn the amp on" }).click();
	await until(page, ([w]) => w.__amp.on === true);
	// The fake device plays a tone: the input meter reads it within a moment.
	await until(page, ([w]) => w.__amp.inputLevel > 0.01);
	await expect(page.getByText(/Latency/)).toBeVisible();
	for (const model of ["clean", "tweed", "fridge", "solid"] as const) {
		await hooked(page, ([w, m]) => w.__amp.setModel(m), model);
		const r = await hooked(page, ([w]) => w.__amp.render(0.5));
		expect(r.rms, model).toBeGreaterThan(0.01);
		expect(r.peak, model).toBeLessThanOrEqual(1);
	}
	// A pedal on changes the sound; the same tone renders louder through the fuzz's make-up or not, but still sounds.
	await hooked(page, ([w]) => w.__amp.setPedal("fuzz", { drive: 0.8 }));
	const fuzzed = await hooked(page, ([w]) => w.__amp.render(0.5));
	expect(fuzzed.rms).toBeGreaterThan(0.01);
	await hooked(page, ([w]) => w.__amp.resetRig());
	await page.getByRole("button", { name: "Turn the amp off" }).click();
	await until(page, ([w]) => w.__amp.on === false);
	expect(errors).toEqual([]);
});

/**
 * The presets (docs/practice-amp.md, "Presets"): the bot, an editor in its
 * account, saves the rig to slot 1 from the manage menu, the slot lights
 * and names it, and the preset is deleted again from the library.
 */
test("saves a preset to a slot and deletes it from the library", async ({ page, errors }) => {
	await open(page, "/practice-amp", "__amp");
	const name = `e2e amp ${Date.now()}`;
	await page.getByRole("button", { name: "Manage presets" }).click();
	await page.getByRole("textbox", { name: "Preset name" }).fill(name);
	await page
		.getByRole("group", { name: "Save to slot" })
		.getByRole("button", { name: "1" })
		.click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByRole("button", { name: `Preset 1: ${name}` })).toBeVisible();
	await expect(page.getByRole("button", { name: `Preset 1: ${name}` })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	// A knob moved off the preset: the slot no longer lights; loading it lights it again.
	await hooked(page, ([w]) => w.__amp.setHead({ gain: 0.9 }));
	await expect(page.getByRole("button", { name: `Preset 1: ${name}` })).toHaveAttribute(
		"aria-pressed",
		"false",
	);
	await page.getByRole("button", { name: `Preset 1: ${name}` }).click();
	await expect(page.getByRole("button", { name: `Preset 1: ${name}` })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	page.once("dialog", (d) => d.accept());
	await page.getByRole("button", { name: "Manage presets" }).click();
	await page.getByRole("button", { name: `Delete ${name}` }).click();
	await expect(page.getByRole("button", { name: `Preset 1: ${name}` })).toHaveCount(0);
	expect(errors).toEqual([]);
});

/** A captured cabinet (docs/practice-amp.md, "Captured cabinets"): chosen on the head, it loads into the chain and the tone still renders. */
test("a captured cabinet loads and renders", async ({ page, errors }) => {
	await open(page, "/practice-amp", "__amp");
	await hooked(page, ([w]) => w.__amp.setHead({ cabinet: "greenback-57" }));
	// The live chain exists once the amp is on; the offline render loads the capture for itself.
	await page.getByRole("button", { name: "Turn the amp on" }).click();
	await until(page, ([w]) => w.__amp.cabinetLoaded() === "greenback-57");
	const r = await hooked(page, ([w]) => w.__amp.render(0.5));
	expect(r.rms).toBeGreaterThan(0.01);
	await hooked(page, ([w]) => w.__amp.setHead({ cabinet: "model" }));
	await until(page, ([w]) => w.__amp.cabinetLoaded() === "open-2x12");
	await page.getByRole("button", { name: "Turn the amp off" }).click();
	expect(errors).toEqual([]);
});
